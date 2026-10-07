/**
 * Step-by-step logging for the Greenlight flow, so a deploy can be followed in the pod's logs.
 *
 * **Temporary.** Every line starts `Greenlight:` and comes from a `trace` call, so the whole of it
 * can be filtered in a log viewer, and taken out later by removing this module and its callers.
 *
 * @namespace namespace:LabkoatApi.greenlightTrace
 */

/**
 * @param {string} step - What just happened, in words
 * @param {object} [details] - Values worth seeing beside it
 */
export function trace(step, details) {
    console.log(`Greenlight: ${step}${details ? ` ${JSON.stringify(details)}` : ''}`);
}

/**
 * The parts of an AWS SDK error worth logging: never the request, which can carry credentials.
 *
 * @param {*} err
 * @returns {object}
 */
export function awsFailure(err) {
    return {
        name: err?.name,
        code: err?.Code ?? err?.code,
        status: err?.$metadata?.httpStatusCode,
        requestId: err?.$metadata?.requestId,
        message: err?.message,
    };
}
