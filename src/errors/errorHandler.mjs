/**
 * Error handler middleware
 */

function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An error occurred';
}

/**
 * Error handler middleware
 *
 * @param err
 * @param req
 * @param res
 * @param next
 */

export default function errorHandler(err, req, res, next) {
    console.error(err.stack);
    const status = err.status || 500;
    res.status(status)
        .json({
            data: [],
            error: {
                status,
                title: err.title || 'Unknown Error',
                details: getErrorMessage(err),
            },
        })
        .end();
    next();
}
