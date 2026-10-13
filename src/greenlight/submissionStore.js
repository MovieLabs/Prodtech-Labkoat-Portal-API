import crypto from 'node:crypto';

import config from '../config.js';

/**
 * Greenlight submissions, held in memory until they are published.
 *
 * A submission is a block of JSON a caller posted, kept under the organisation it was posted for, so
 * that anyone in that organisation's greenlight group can find it in the Portal and publish it. Every
 * block gets its own id: a caller may post several before publishing any, and the Portal publishes
 * one at a time.
 *
 * **Disposable, like pipeline runs.** Nothing is persisted, a restart or a deploy empties the store,
 * and the routes are only correct on a single replica, which this service is already pinned to.
 * Publishing removes a submission; one nobody publishes expires after `GREENLIGHT_TTL_MS`. Expired
 * entries are swept on every write, so there is no timer to leak.
 *
 * @namespace namespace:LabkoatApi.greenlightStore
 */

/**
 * @typedef {object} Submission
 * @property {string} id
 * @property {string} organisation - Whose greenlight group may see and publish it
 * @property {string} submittedBy - A person's email or a machine client's name
 * @property {string} receivedAt - ISO time
 * @property {string} expiresAt - ISO time
 * @property {*} data - The posted JSON
 */

/** @type {Map<string, {id: string, organisation: string, submittedBy: string, receivedAt: number, expiresAt: number, data: *}>} */
const submissions = new Map();

/** Drop what has expired. */
function sweep(now = Date.now()) {
    for (const [id, submission] of submissions) {
        if (submission.expiresAt <= now) submissions.delete(id);
    }
}

/**
 * The record as a caller sees it, with timestamps as ISO strings.
 *
 * @param {object} submission
 * @returns {Submission}
 */
const view = ((submission) => ({
    id: submission.id,
    organisation: submission.organisation,
    submittedBy: submission.submittedBy,
    receivedAt: new Date(submission.receivedAt).toISOString(),
    expiresAt: new Date(submission.expiresAt).toISOString(),
    data: submission.data,
}));

/**
 * Hold a block of JSON for an organisation.
 *
 * @param {Object} params
 * @param {string} params.organisation
 * @param {string} params.submittedBy
 * @param {*} params.data - The posted JSON
 * @returns {Submission|null} The stored submission, or null when the organisation already holds the
 *   maximum
 */
export function addSubmission({ organisation, submittedBy, data }) {
    const now = Date.now();
    sweep(now);
    const held = [...submissions.values()].filter((s) => s.organisation === organisation).length;
    if (held >= config.GREENLIGHT_MAX_PER_ORGANISATION) return null;

    const submission = {
        id: crypto.randomUUID(),
        organisation,
        submittedBy,
        receivedAt: now,
        expiresAt: now + config.GREENLIGHT_TTL_MS,
        data,
    };
    submissions.set(submission.id, submission);
    return view(submission);
}

/**
 * Everything posted for these organisations and not yet published, oldest first.
 *
 * @param {string[]} organisations
 * @returns {Submission[]}
 */
export function listSubmissions(organisations) {
    const now = Date.now();
    return [...submissions.values()]
        .filter((s) => organisations.includes(s.organisation) && s.expiresAt > now)
        .sort((a, b) => a.receivedAt - b.receivedAt)
        .map(view);
}

/**
 * Take a submission out of the store, for publishing. Another organisation's id answers exactly as
 * an unknown one does, so ids cannot be probed.
 *
 * @param {Object} params
 * @param {string[]} params.organisations - The caller's
 * @param {string} params.id - The submission
 * @returns {Submission|null} The submission, or null when there is none this caller may take
 */
export function takeSubmission({ organisations, id }) {
    const submission = submissions.get(id);
    if (!submission || !organisations.includes(submission.organisation) || submission.expiresAt <= Date.now()) {
        return null;
    }
    submissions.delete(id);
    return view(submission);
}

/**
 * Put a taken submission back, when publishing it failed, so it can be approved again.
 *
 * @param {Submission} submission - As `takeSubmission` returned it
 */
export function restoreSubmission(submission) {
    submissions.set(submission.id, {
        ...submission,
        receivedAt: Date.parse(submission.receivedAt),
        expiresAt: Date.parse(submission.expiresAt),
    });
}
