/**
 * What publishing a Greenlight submission does.
 *
 * **Not decided yet.** For now it logs the job id and that it executed, so a run can be traced
 * from the Portal's Approve button to here; the action it should trigger comes later. Whatever it becomes, it receives one submission, already taken out of the store, and either
 * completes or throws. A throw puts the submission back, so the caller can try again.
 *
 * @param {Object} params
 * @param {{id: string, receivedAt: string, data: *}} params.submission
 * @param {string} params.caller - Who asked, as a name worth logging
 * @returns {Promise<{publishedAt: string}>}
 */
export default async function publishSubmission({ submission, caller }) {
    const publishedAt = new Date().toISOString();
    console.log(`Greenlight: job ${submission.id} executed (approved by ${caller})`);
    return { publishedAt };
}
