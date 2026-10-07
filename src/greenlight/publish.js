import { sendToQueue } from './queue.js';

/**
 * What publishing a Greenlight submission does: send it to the workflow queue.
 *
 * It receives one submission, already taken out of the store, and either completes or throws. A throw
 * puts the submission back, so the person can approve it again — and because the job id is the
 * queue's deduplication id, a retry after a send that did land is not delivered twice.
 *
 * `send` is replaceable so the checks in `greenlight.verify.mjs` run without AWS.
 *
 * @namespace namespace:LabkoatApi.greenlightPublish
 */

let send = sendToQueue;

/**
 * Swap the sender, for a check that must not reach AWS.
 *
 * @param {Function} sender - `({ submission, approvedBy }) => Promise<messageId>`
 */
export function useSender(sender) {
    send = sender;
}

/**
 * @param {Object} params
 * @param {{id: string, receivedAt: string, data: *}} params.submission
 * @param {string} params.caller - Who approved it, as a name worth logging
 * @returns {Promise<{publishedAt: string, messageId: string}>}
 */
export default async function publishSubmission({ submission, caller }) {
    const messageId = await send({ submission, approvedBy: caller });
    const publishedAt = new Date().toISOString();
    console.log(`Greenlight: job ${submission.id} executed (approved by ${caller}), sent as message ${messageId}`);
    return { publishedAt, messageId };
}
