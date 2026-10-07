import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

import config from '../config.js';

/**
 * The queue an approved Greenlight submission is sent to: a FIFO SQS queue owned by another
 * organisation, in their AWS account.
 *
 * **Reached by assuming their role.** `fromTemporaryCredentials` calls `AssumeRole` with whatever
 * identity this process already has — in the cluster, the role injected into the pod through its
 * service account; locally, the developer's own AWS credentials — and renews the 15-minute session
 * itself before it lapses. Nothing here branches on where it is running: the other side's trust
 * policy decides which of those identities may assume the role, and so must name each of them.
 *
 * Built on first send, so a process that never publishes never calls STS.
 *
 * @namespace namespace:LabkoatApi.greenlightQueue
 */

const SESSION_SECONDS = 900; // The shortest session AssumeRole grants

/** @type {SQSClient|null} */
let client = null;

/** @returns {SQSClient} */
function queueClient() {
    client = client ?? new SQSClient({
        region: config.AWS_REGION,
        credentials: fromTemporaryCredentials({
            params: {
                RoleArn: config.GREENLIGHT_QUEUE_ROLE_ARN,
                RoleSessionName: 'labkoat-greenlight', // Shows in the other account's CloudTrail
                DurationSeconds: SESSION_SECONDS,
            },
            clientConfig: { region: config.AWS_REGION },
        }),
    });
    return client;
}

/**
 * Send one approved submission.
 *
 * The body is the submitted JSON, exactly as it was posted. The job id rides as a message attribute
 * and is also the **deduplication id**, so if an approval is retried after a send that did land,
 * SQS discards the second copy (within its five-minute window) rather than delivering the job twice.
 *
 * @param {Object} params
 * @param {{id: string, data: *}} params.submission
 * @param {string} params.approvedBy - Who approved it, for the receiver's information
 * @returns {Promise<string>} The SQS MessageId
 */
export async function sendToQueue({ submission, approvedBy }) {
    const response = await queueClient().send(new SendMessageCommand({
        QueueUrl: config.GREENLIGHT_QUEUE_URL,
        MessageBody: JSON.stringify(submission.data),
        MessageGroupId: config.GREENLIGHT_MESSAGE_GROUP,
        MessageDeduplicationId: submission.id,
        MessageAttributes: {
            jobId: { DataType: 'String', StringValue: submission.id },
            approvedBy: { DataType: 'String', StringValue: approvedBy },
        },
    }));
    return response.MessageId;
}
