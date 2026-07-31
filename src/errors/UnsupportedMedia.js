/**
 * Custom error classes
 */

export default class UnsupportedMedia extends Error {
    constructor(message) {
        super(message);
        this.status = 415;
        this.title = 'Unsupported Media Type';
        this.message = `Unsupported media type: ${message}`;
    }
}
