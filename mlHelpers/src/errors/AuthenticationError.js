/**
 * Custom error classes
 */

export default class AuthenticationError extends Error {
    constructor(message) {
        super(message);
        this.status = 401;
        this.title = 'Authentication Error';
        this.message = message;
    }
}
