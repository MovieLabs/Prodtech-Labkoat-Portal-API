/**
 * Custom error classes
 */

/**
 * Object storage refused this service. The caller did nothing wrong: the service's own credentials
 * (the pod's IAM role, or a developer's AWS profile) lack the permission, so the fix is in IAM.
 * 502 because the refusal comes from upstream of this service, and so it reads differently in the
 * logs from both a bug here (500) and a caller who may not have the file (403).
 */
export default class StorageAccessDenied extends Error {
    constructor(message) {
        super(message);
        this.status = 502;
        this.title = 'Storage Access Denied';
        this.message = message;
    }
}
