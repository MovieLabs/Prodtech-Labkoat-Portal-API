/**
 * Custom error classes
 */

export default class InvalidQuery extends Error {
    constructor(message) {
        super(message);
        this.status = 404;
        this.title = 'Invalid Query';
        this.message = `Invalid query: ${message}`;
    }
}
