/**
 * Custom error classes
 */

export default class AuthorizationError extends Error {
    constructor(message) {
        super(message);
        this.status = 401;
        this.title = 'Authorization Error';
        this.message = `Authorization Error: ${message}`;
    }
}
