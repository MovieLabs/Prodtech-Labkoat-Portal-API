/**
 * Error class for invalid project
 */

export default class InvalidProject extends Error {
    constructor(project) {
        super(project);
        this.status = 404;
        this.title = 'Invalid Project';
        this.message = `Project not found: ${project}`;
    }
}
