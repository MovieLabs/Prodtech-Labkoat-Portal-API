/**
 * Custom error classes
 */

export default class AuthorizationError extends Error {
    constructor(message) {
        super(message);
        this.status = 403;
        this.title = 'Authorization Error';
        this.message = message;
    }
}
