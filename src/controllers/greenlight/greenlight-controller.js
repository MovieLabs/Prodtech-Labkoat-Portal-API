/**
 * Controllers for the Greenlight tab: an internal test bench in the Portal, for anything that needs a
 * page to display or trigger it.
 * @module
 */

import { claimedActor } from '../../auth/actor.js';
import AuthorizationError from '../../errors/AuthorizationError.js';
import InvalidQuery from '../../errors/InvalidQuery.js';
import InvalidRequest from '../../errors/InvalidRequest.js';
import UnsupportedMedia from '../../errors/UnsupportedMedia.js';
import { callerName, organisationsOf } from '../../greenlight/access.js';
import publishSubmission from '../../greenlight/publish.js';
import {
    addSubmission, listSubmissions, restoreSubmission, takeSubmission,
} from '../../greenlight/submissionStore.js';
import { trace } from '../../greenlight/trace.js';

/** Success envelope, as the pipeline routes answer. */
const ok = (res, data, status = 200) => res.status(status).json({ data, errors: null, warnings: null });

/**
 * Echo the request back, with who sent it, so the Portal can prove its round trip works.
 * @param req
 * @param res
 * @returns {void}
 */
export function greenlightPingController(req, res) {
    res.status(200).json({
        received: req.body ?? null,
        caller: claimedActor(req),
        at: new Date().toISOString(),
    });
}

/**
 * The one organisation a post is for: the caller's only one, or the `?organisation=` it names when
 * it has several.
 *
 * @param req
 * @returns {string} The organisation
 * @throws {AuthorizationError|InvalidRequest}
 */
function postingOrganisation(req) {
    const organisations = organisationsOf(req);
    const named = req.query?.organisation;
    if (named) {
        if (!organisations.includes(named)) throw new AuthorizationError(`not a greenlight member of ${named}`);
        return named;
    }
    if (organisations.length === 0) throw new AuthorizationError('no greenlight organisation');
    if (organisations.length > 1) {
        throw new InvalidRequest(`name one of ${organisations.join(', ')} as ?organisation=`);
    }
    return organisations[0];
}

/**
 * Hold a block of JSON for an organisation, until someone in it publishes it from the Portal.
 *
 * Each block is stored separately and answered with its own id, so a caller can post several.
 * The body must be JSON, an object or an array, and not empty.
 *
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 */
export async function createSubmissionController(req, res, next) {
    trace('post received', { caller: claimedActor(req), kind: req.tokenKind, contentType: req.headers?.['content-type'] });
    if (!req.is('application/json')) {
        trace('post refused: not JSON');
        next(new UnsupportedMedia('a submission is sent as application/json'));
        return;
    }
    const data = req.body;
    const empty = data === null || typeof data !== 'object' || Object.keys(data).length === 0;
    if (empty) {
        trace('post refused: empty body');
        next(new InvalidRequest('a submission is a non-empty JSON object or array'));
        return;
    }
    let organisation;
    try {
        organisation = postingOrganisation(req);
    } catch (err) {
        trace('post refused', { error: err.message });
        next(err);
        return;
    }

    const submission = addSubmission({ organisation, submittedBy: await callerName(req), data });
    if (!submission) {
        trace('post refused: organisation at the cap', { organisation });
        next(new InvalidRequest('too many unpublished submissions; publish some before sending more'));
        return;
    }
    trace('job stored', {
        jobId: submission.id, organisation, submittedBy: submission.submittedBy,
        bytes: JSON.stringify(data).length, expiresAt: submission.expiresAt,
    });
    ok(res, {
        id: submission.id, organisation, receivedAt: submission.receivedAt, expiresAt: submission.expiresAt,
    }, 201);
}

/**
 * The unpublished submissions of every organisation the caller is in, oldest first, each with its
 * data.
 *
 * @param req
 * @param res
 * @returns {void}
 */
export function listSubmissionsController(req, res) {
    const organisations = organisationsOf(req);
    const held = listSubmissions(organisations);
    trace('jobs listed', { caller: claimedActor(req), organisations, count: held.length });
    ok(res, held);
}

/**
 * Publish one submission of the caller's organisations, which removes it from the store.
 *
 * Publishing sends the block to the workflow queue (`greenlight/publish.js`). An id that is unknown,
 * expired, already published or another organisation's is a 404 either way. If the send throws, the
 * submission is put back so it can be approved again.
 *
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 */
export async function publishSubmissionController(req, res, next) {
    trace('approve received', { jobId: req.params.id, caller: claimedActor(req) });
    const submission = takeSubmission({ organisations: organisationsOf(req), id: req.params.id });
    if (!submission) {
        trace('approve refused: no such job for this caller', { jobId: req.params.id });
        next(new InvalidQuery(`no unpublished submission ${req.params.id}`));
        return;
    }
    try {
        const { publishedAt, messageId } = await publishSubmission({ submission, caller: await callerName(req) });
        trace('approve done', { jobId: submission.id, messageId });
        ok(res, { id: submission.id, publishedAt, messageId });
    } catch (err) {
        restoreSubmission(submission);
        trace('approve failed: job put back to try again', { jobId: submission.id, error: err?.message });
        next(err);
    }
}
