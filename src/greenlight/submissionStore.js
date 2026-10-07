import crypto from 'node:crypto';

import config from '../config.js';

/**
 * Greenlight submissions, held in memory until they are published.
 *
 * A submission is a block of JSON a caller posted, kept under the Cognito `sub` of whoever posted it
 * so that the same person, signed in to the Portal, can find it and publish it. Every block gets its
 * own id: a caller may post several before publishing any, and the Portal publishes one at a time.
 *
 * **Disposable, like pipeline runs.** Nothing is persisted, a restart or a deploy empties the store,
 * and the routes are only correct on a single replica, which this service is already pinned to.
 * Publishing removes a submission; one nobody publishes expires after `GREENLIGHT_TTL_MS`. Expired
 * entries are swept on every write, so there is no timer to leak.
 *
 * @namespace namespace:LabkoatApi.greenlightStore
 */

/** @type {Map<string, {id: string, sub: string, receivedAt: number, expiresAt: number, data: *}>} */
const submissions = new Map();

/** Drop what has expired. */
function sweep(now = Date.now()) {
    for (const [id, submission] of submissions) {
        if (submission.expiresAt <= now) submissions.delete(id);
    }
}

/**
 * The record as a caller sees it: timestamps as ISO strings, and no `sub`, which only this store
 * needs.
 *
 * @param {object} submission
 * @returns {{id: string, receivedAt: string, expiresAt: string, data: *}}
 */
const view = ((submission) => ({
    id: submission.id,
    receivedAt: new Date(submission.receivedAt).toISOString(),
    expiresAt: new Date(submission.expiresAt).toISOString(),
    data: submission.data,
}));

/**
 * Hold a block of JSON for its sender.
 *
 * @param {Object} params
 * @param {string} params.sub - The sender's Cognito `sub`
 * @param {*} params.data - The posted JSON
 * @returns {object|null} The stored submission, or null when the sender already holds the maximum
 */
export function addSubmission({ sub, data }) {
    const now = Date.now();
    sweep(now);
    const held = [...submissions.values()].filter((s) => s.sub === sub).length;
    if (held >= config.GREENLIGHT_MAX_PER_USER) return null;

    const submission = {
        id: crypto.randomUUID(),
        sub,
        receivedAt: now,
        expiresAt: now + config.GREENLIGHT_TTL_MS,
        data,
    };
    submissions.set(submission.id, submission);
    return view(submission);
}

/**
 * Everything one person has submitted and not yet published, oldest first.
 *
 * @param {string} sub
 * @returns {object[]}
 */
export function listSubmissions(sub) {
    const now = Date.now();
    return [...submissions.values()]
        .filter((s) => s.sub === sub && s.expiresAt > now)
        .sort((a, b) => a.receivedAt - b.receivedAt)
        .map(view);
}

/**
 * Take a submission out of the store, for publishing. Only its sender may take it: another
 * person's id answers exactly as an unknown one does, so ids cannot be probed.
 *
 * @param {Object} params
 * @param {string} params.sub - The caller's Cognito `sub`
 * @param {string} params.id - The submission
 * @returns {object|null} The submission, or null when there is none this caller may take
 */
export function takeSubmission({ sub, id }) {
    const submission = submissions.get(id);
    if (!submission || submission.sub !== sub || submission.expiresAt <= Date.now()) return null;
    submissions.delete(id);
    return view(submission);
}

/**
 * Put a taken submission back, when publishing it failed, so the caller can try again.
 *
 * @param {Object} params
 * @param {string} params.sub
 * @param {object} params.submission - As `takeSubmission` returned it
 */
export function restoreSubmission({ sub, submission }) {
    submissions.set(submission.id, {
        id: submission.id,
        sub,
        receivedAt: Date.parse(submission.receivedAt),
        expiresAt: Date.parse(submission.expiresAt),
        data: submission.data,
    });
}
