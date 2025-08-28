/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

import config from '../../../config.mjs';

const fMamUrl = config.FMAM_URL;
const graphQlUrl = config.GRAPHQL_URL;

const queryValidator = {
    project: {
        type: 'string',
        required: true,
    },
};

/**
 * Start the reshoot messaging service
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 */
export async function greenlightReshootController(req, res, next) {
    const { path } = req.route;
    const { method } = req;
    console.log(`${method}: ${path}`);

    res.status(200)
        .json({ message: 'Got your payload' })
        .send()
}
