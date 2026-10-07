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

import { GREENLIGHT_GROUP } from './access.js';
import { addSubmission, listSubmissions, takeSubmission } from './submissionStore.js';

let checked = 0;

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

// ---- a request that has passed the token check, and a response that records what it was sent ----

const request = ((sub, { body, params = {}, json = true } = {}) => ({
    user: { sub, username: sub },
    body,
    params,
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

const alice = 'sub-alice';
const bob = 'sub-bob';
const block = (n) => ({ shot: n, takes: [1, 2, 3] });

// ---- posting: each block is its own submission ----

const first = await call(createSubmissionController, request(alice, { body: block(1) }));
const second = await call(createSubmissionController, request(alice, { body: block(2) }));
is('a post is a 201', first.status, 201);
is('each post gets its own id', first.body.data.id !== second.body.data.id, true);
is('the id is a uuid', /^[0-9a-f-]{36}$/.test(first.body.data.id), true);

is('an empty object is refused', (await call(createSubmissionController, request(alice, { body: {} }))).error.status, 400);
is('an empty array is refused', (await call(createSubmissionController, request(alice, { body: [] }))).error.status, 400);
is('a non-JSON body is a 415', (await call(createSubmissionController, request(alice, { body: 'x', json: false }))).error.status, 415);

// ---- listing: your own, oldest first, with the data ----

const listed = (await call(listSubmissionsController, request(alice))).body.data;
is('alice sees both of hers, oldest first', listed.map((s) => s.data.shot), [1, 2]);
is('bob sees none of them', (await call(listSubmissionsController, request(bob))).body.data, []);

// ---- publishing: removes it, and only its sender may ----

const bobTries = await call(publishSubmissionController, request(bob, { params: { id: first.body.data.id } }));
is("someone else's id is a 404", bobTries.error.status, 404);

const published = await call(publishSubmissionController, request(alice, { params: { id: first.body.data.id } }));
is('publishing is a 200', published.status, 200);
is('publishing answers with the id', published.body.data.id, first.body.data.id);
is('a published submission is gone', listSubmissions(alice).map((s) => s.data.shot), [2]);

const again = await call(publishSubmissionController, request(alice, { params: { id: first.body.data.id } }));
is('publishing it twice is a 404', again.error.status, 404);

// ---- expiry, and the per-sender cap ----

const realNow = Date.now;
const stale = addSubmission({ sub: 'sub-carol', data: block(9) });
Date.now = () => realNow() + config.GREENLIGHT_TTL_MS + 1;
is('an expired submission is not listed', listSubmissions('sub-carol'), []);
is('nor can it be taken', takeSubmission({ sub: 'sub-carol', id: stale.id }), null);
Date.now = realNow;

for (let i = 0; i < config.GREENLIGHT_MAX_PER_USER; i += 1) addSubmission({ sub: 'sub-dave', data: block(i) });
is('a sender at the cap is refused', addSubmission({ sub: 'sub-dave', data: block(0) }), null);
is('another sender is not', addSubmission({ sub: 'sub-erin', data: block(0) }) !== null, true);

console.log(`greenlight.verify: ${checked} checks passed`);
