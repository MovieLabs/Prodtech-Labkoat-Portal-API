import boto3
import json
import uuid

LaunchRole = "arn:aws:iam::792207722107:role/LaunchApp"
QueueURL = "https://sqs.us-west-2.amazonaws.com/792207722107/workflow-test.fifo"
# 900 is the min
Duration = 900

sts = boto3.client("sts")
# The RoleSessionName is used for logging
role = sts.assume_role(
    RoleArn=LaunchRole, DurationSeconds=Duration, RoleSessionName="LaunchAppTest"
)
credentials = role["Credentials"]
sqs = boto3.client(
    "sqs",
    aws_access_key_id=credentials["AccessKeyId"],
    aws_secret_access_key=credentials["SecretAccessKey"],
    aws_session_token=credentials["SessionToken"],
)
msgdata = {"hello": "world"}
response = sqs.send_message(
    QueueUrl=QueueURL,
    MessageBody=json.dumps(msgdata),
    # Messages with same group ID are processed in order within the queue
    MessageGroupId="workflow",
    # Deduplication ID prevents duplicate messages within 5 minutes
    MessageDeduplicationId=str(uuid.uuid4()),
)
print(f"Message Sent {response}")
messages = sqs.receive_message(QueueUrl=QueueURL, WaitTimeSeconds=5)
print(f"Got messages {messages}")
for msg in messages["Messages"]:
    sqs.delete_message(QueueUrl=QueueURL, ReceiptHandle=msg["ReceiptHandle"])
    print(f"Deleted Message {msg}")
