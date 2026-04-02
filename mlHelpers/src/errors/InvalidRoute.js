/**
 * Error class for invalid project
 */

export default class InvalidRoute extends Error {
    constructor() {
        super();
        this.status = 404;
        this.title = 'Invalid Route';
        this.message = 'The route you are trying to access does not exist';
    }
}
