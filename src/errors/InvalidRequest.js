/**
 * Custom error classes
 */

/**
 * A request the service understood but cannot act on: a missing field, an unknown pipeline, a
 * malformed body.
 *
 * Distinct from `InvalidQuery`, which is a 404 for a lookup that found nothing. Nothing is missing
 * here — the request itself is wrong, which is a 400.
 */
export default class InvalidRequest extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
        this.title = 'Invalid Request';
        this.message = `Invalid request: ${message}`;
    }
}
