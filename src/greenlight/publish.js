/**
 * What publishing a Greenlight submission does.
 *
 * **Not decided yet.** For now it records that it happened; the action it should trigger comes
 * later. Whatever it becomes, it receives one submission, already taken out of the store, and either
 * completes or throws. A throw puts the submission back, so the caller can try again.
 *
 * @param {Object} params
 * @param {{id: string, receivedAt: string, data: *}} params.submission
 * @param {string} params.caller - Who asked, as a name worth logging
 * @returns {Promise<{publishedAt: string}>}
 */
export default async function publishSubmission({ submission, caller }) {
    const publishedAt = new Date().toISOString();
    console.log(`Greenlight: ${caller} published ${submission.id} (received ${submission.receivedAt})`);
    return { publishedAt };
}
