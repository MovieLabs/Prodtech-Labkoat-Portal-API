/**
 * Controllers for the Greenlight tab: an internal test bench in the Portal, for anything that needs a
 * page to display or trigger it.
 * @module
 */

import { claimedActor } from '../../auth/actor.js';
import InvalidQuery from '../../errors/InvalidQuery.js';
import InvalidRequest from '../../errors/InvalidRequest.js';
import UnsupportedMedia from '../../errors/UnsupportedMedia.js';
import publishSubmission from '../../greenlight/publish.js';
import {
    addSubmission, listSubmissions, restoreSubmission, takeSubmission,
} from '../../greenlight/submissionStore.js';

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
 * Hold a block of JSON for its sender, until they publish it from the Portal.
 *
 * Each block is stored separately and answered with its own id, so a caller can post several.
 * The body must be JSON, an object or an array, and not empty.
 *
 * @param req
 * @param res
 * @param next
 * @returns {void}
 */
export function createSubmissionController(req, res, next) {
    if (!req.is('application/json')) {
        next(new UnsupportedMedia('a submission is sent as application/json'));
        return;
    }
    const data = req.body;
    const empty = data === null || typeof data !== 'object' || Object.keys(data).length === 0;
    if (empty) {
        next(new InvalidRequest('a submission is a non-empty JSON object or array'));
        return;
    }

    const submission = addSubmission({ sub: req.user.sub, data });
    if (!submission) {
        next(new InvalidRequest('too many unpublished submissions; publish some before sending more'));
        return;
    }
    ok(res, { id: submission.id, receivedAt: submission.receivedAt, expiresAt: submission.expiresAt }, 201);
}

/**
 * The caller's unpublished submissions, oldest first, each with its data.
 *
 * @param req
 * @param res
 * @returns {void}
 */
export function listSubmissionsController(req, res) {
    ok(res, listSubmissions(req.user.sub));
}

/**
 * Publish one of the caller's submissions, which removes it from the store.
 *
 * Publishing sends the block to the workflow queue (`greenlight/publish.js`). An id that is unknown,
 * expired, already published or someone else's is a 404 either way. If the send throws, the
 * submission is put back so it can be approved again.
 *
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 */
export async function publishSubmissionController(req, res, next) {
    const { sub } = req.user;
    const submission = takeSubmission({ sub, id: req.params.id });
    if (!submission) {
        next(new InvalidQuery(`no unpublished submission ${req.params.id}`));
        return;
    }
    try {
        const { publishedAt, messageId } = await publishSubmission({ submission, caller: claimedActor(req) });
        ok(res, { id: submission.id, publishedAt, messageId });
    } catch (err) {
        restoreSubmission({ sub, submission });
        next(err);
    }
}
