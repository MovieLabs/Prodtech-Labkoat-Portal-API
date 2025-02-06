/**
 * Custom error classes
 */

export default class InternalError extends Error {
    constructor(message) {
        super(message);
        this.status = 500;
        this.title = 'Internal Error';
        this.message = `Internal Error: ${message}`;
    }
}
