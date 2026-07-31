/**
 * Custom error classes
 */

export default class PayloadTooLarge extends Error {
    constructor(message) {
        super(message);
        this.status = 413;
        this.title = 'File Too Large';
        this.message = `File too large: ${message}`;
    }
}
