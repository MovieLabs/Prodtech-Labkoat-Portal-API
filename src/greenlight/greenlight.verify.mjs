/**
 * Runnable check of the Greenlight submissions: who may use them, and what the store and the
 * controllers do with a block of JSON from posting to publishing.
 *
 * `npm run verify:greenlight`
 *
 * The controllers are called with a request that has already passed the token check, so nothing
 * here needs Cognito or a running service. Throws on failure; prints a summary on success.
 */

import config from '../config.js';
import {
    createSubmissionController, listSubmissionsController, publishSubmissionController,
} from '../controllers/greenlight/greenlight-controller.js';

import { GREENLIGHT_GROUP, organisationsOf } from './access.js';
import { useSender } from './publish.js';
import { workflowMessage } from './queue.js';
import { addSubmission, listSubmissions, takeSubmission } from './submissionStore.js';

let checked = 0;

// Nothing here reaches SQS: the sender records what it was handed, or fails when told to.
const sent = [];
let failNext = false;
useSender(async (message) => {
    if (failNext) {
        failNext = false;
        throw new Error('queue unreachable');
    }
    sent.push(message);
    return `msg-${sent.length}`;
});

/**
 * @param {string} what
 * @param {*} got
 * @param {*} wanted
 */
function is(what, got, wanted) {
    if (JSON.stringify(got) !== JSON.stringify(wanted)) {
        throw new Error(`${what}\n  got:    ${JSON.stringify(got)}\n  wanted: ${JSON.stringify(wanted)}`);
    }
    checked += 1;
}

// ---- the gate: `greenlight`, under any organisation ----

for (const group of ['greenlight', 'labkoat:greenlight', 'konsol:greenlight']) {
    is(`${group} opens the routes`, GREENLIGHT_GROUP.test(group), true);
}
for (const group of ['labkoat', 'labkoat:admin', 'greenlight-admin', 'labkoat:greenlight:extra', 'xgreenlight', ':greenlight']) {
    is(`${group} does not`, GREENLIGHT_GROUP.test(group), false);
}

// ---- requests that have passed the token check, and a response that records what it was sent ----

config.GREENLIGHT_CLIENTS['client-konsol'] = { organisation: 'konsol', name: 'Konsol pipeline' };

/** A person, in the given groups. */
const person = ((sub, groups) => ({ tokenKind: 'user', user: { sub, 'username': sub, 'cognito:groups': groups } }));

/** A machine client, by its client id. */
const client = ((clientId) => ({
    tokenKind: 'machine',
    user: { sub: clientId, client_id: clientId, scope: config.GREENLIGHT_SCOPE },
}));

const request = ((caller, { body, params = {}, query = {}, json = true } = {}) => ({
    ...caller,
    headers: {},
    body,
    params,
    query,
    is: (type) => json && type === 'application/json',
}));

/** Run a controller; resolves to `{ status, body }` or `{ error }` when it called `next(err)`. */
async function call(controller, req) {
    const outcome = {};
    const res = {
        status(code) {
            outcome.status = code;
            return this;
        },
        json(body) {
            outcome.body = body;
            return this;
        },
    };
    await controller(req, res, (err) => {
        outcome.error = err;
    });
    return outcome;
}

const alice = person('sub-alice', ['labkoat:greenlight']);
const amy = person('sub-amy', ['greenlight', 'labkoat:admin']);
const kim = person('sub-kim', ['konsol:greenlight']);
const both = person('sub-bo', ['labkoat:greenlight', 'konsol:greenlight']);
const konsolPipeline = client('client-konsol');
const block = (n) => ({ shot: n, takes: [1, 2, 3] });

// ---- organisations: from the group, or from the client's configuration ----

is('labkoat:greenlight is labkoat', organisationsOf(alice), ['labkoat']);
is('a bare greenlight is labkoat too', organisationsOf(amy), ['labkoat']);
is('two greenlight groups are two organisations', organisationsOf(both), ['labkoat', 'konsol']);
is('a configured client is its organisation', organisationsOf(konsolPipeline), ['konsol']);
is('an unconfigured client is none', organisationsOf(client('client-unknown')), []);

// ---- posting: each block is its own submission, for one organisation ----

const first = await call(createSubmissionController, request(alice, { body: block(1) }));
const second = await call(createSubmissionController, request(alice, { body: block(2) }));
is('a post is a 201', first.status, 201);
is('each post gets its own id', first.body.data.id !== second.body.data.id, true);
is('the id is a uuid', /^[0-9a-f-]{36}$/.test(first.body.data.id), true);
is('and it says whose it is', first.body.data.organisation, 'labkoat');

is('an empty object is refused', (await call(createSubmissionController, request(alice, { body: {} }))).error.status, 400);
is('an empty array is refused', (await call(createSubmissionController, request(alice, { body: [] }))).error.status, 400);
is('a non-JSON body is a 415', (await call(createSubmissionController, request(alice, { body: 'x', json: false }))).error.status, 415);

const unnamed = await call(createSubmissionController, request(both, { body: block(3) }));
is('two organisations must name one', unnamed.error.status, 400);
const named = await call(createSubmissionController, request(both, { body: block(3), query: { organisation: 'konsol' } }));
is('and then post for it', named.body.data.organisation, 'konsol');
const notMine = await call(createSubmissionController, request(alice, { body: block(3), query: { organisation: 'konsol' } }));
is('naming one you are not in is a 403', notMine.error.status, 403);
const unknownClient = await call(createSubmissionController, request(client('client-unknown'), { body: block(3) }));
is('an unconfigured client is a 403', unknownClient.error.status, 403);

const fromMachine = await call(createSubmissionController, request(konsolPipeline, { body: block(4) }));
is('a machine client posts for its organisation', fromMachine.body.data.organisation, 'konsol');

// ---- listing: every job of your organisations, oldest first, with the data ----

const listed = (await call(listSubmissionsController, request(amy))).body.data;
is("anyone in labkoat sees labkoat's jobs, oldest first", listed.map((s) => s.data.shot), [1, 2]);
is('with who posted them', listed[0].submittedBy, 'sub-alice');
const konsolJobs = (await call(listSubmissionsController, request(kim))).body.data;
is('konsol sees its own, from a person or a machine', konsolJobs.map((s) => s.data.shot), [3, 4]);
is("a machine's are posted under its name", konsolJobs[1].submittedBy, 'Konsol pipeline');
is('two organisations see both', (await call(listSubmissionsController, request(both))).body.data.length, 4);

// ---- publishing: removes it, and only its organisation may ----

const kimTries = await call(publishSubmissionController, request(kim, { params: { id: first.body.data.id } }));
is("another organisation's id is a 404", kimTries.error.status, 404);

const published = await call(publishSubmissionController, request(amy, { params: { id: first.body.data.id } }));
is('anyone in the organisation may publish', published.status, 200);
is('publishing answers with the id', published.body.data.id, first.body.data.id);
is('a published submission is gone', listSubmissions(['labkoat']).map((s) => s.data.shot), [2]);
is('publishing sends the posted JSON', sent[0].submission.data, block(1));
is('and the job id with it', sent[0].submission.id, first.body.data.id);
is('and who approved it', sent[0].approvedBy, 'sub-amy');
is('and answers with the message id', published.body.data.messageId, 'msg-1');

failNext = true;
const refused = await call(publishSubmissionController, request(alice, { params: { id: second.body.data.id } }));
is('a failed send is an error', refused.error.message, 'queue unreachable');
is('and the submission stays, to approve again', listSubmissions(['labkoat']).map((s) => s.id), [second.body.data.id]);
is('as it was', listSubmissions(['labkoat'])[0].submittedBy, 'sub-alice');

const again = await call(publishSubmissionController, request(alice, { params: { id: first.body.data.id } }));
is('publishing it twice is a 404', again.error.status, 404);

// ---- expiry, and the per-organisation cap ----

const realNow = Date.now;
const stale = addSubmission({ organisation: 'carol-co', submittedBy: 'carol', data: block(9) });
Date.now = () => realNow() + config.GREENLIGHT_TTL_MS + 1;
is('an expired submission is not listed', listSubmissions(['carol-co']), []);
is('nor can it be taken', takeSubmission({ organisations: ['carol-co'], id: stale.id }), null);
Date.now = realNow;

for (let i = 0; i < config.GREENLIGHT_MAX_PER_ORGANISATION; i += 1) {
    addSubmission({ organisation: 'dave-co', submittedBy: 'dave', data: block(i) });
}
is('an organisation at the cap is refused', addSubmission({ organisation: 'dave-co', submittedBy: 'dave', data: block(0) }), null);
is('another is not', addSubmission({ organisation: 'erin-co', submittedBy: 'erin', data: block(0) }) !== null, true);

// ---- the message the queue receives: the header, wrapping the posted JSON ----

is('the workflow message wraps the posted JSON', workflowMessage({ id: 'job-9', data: block(7) }), {
    header: {
        headerVersion: '0.1',
        messageSchema: 'http://movielabs.com/greenlight.json',
        messageType: 'greenlight.workflow-start',
        messageTypeVersion: '0.1',
    },
    body: { contents: { pullData: block(7) } },
});

console.log(`greenlight.verify: ${checked} checks passed`);
