/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

import { fMamProxy } from '../fMamFetch.mjs';
import config from '../../../config.mjs';

const fMamUrl = config.FMAM_URL;
const graphQlUrl = config.GRAPHQL_URL;

const queryValidator = {
    project: {
        type: 'string',
        required: true,
    },
};

export async function proxyController(req, res, next) {
    const { path } = req.route;
    const { method } = req;
    console.log(`${method}: ${path}`);

    // Proxy this through to the fMam API
    fMamProxy({
        res,
        req,
        next,
        method,
        route: `/omc/v1${path}`,
        queryValidator,
        baseUrl: fMamUrl,
    });
}

/**
 * Proxy a graphql request to the fMam
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 */
export async function graphqlController(req, res, next) {
    const { path } = req.route;
    const { method } = req;
    console.log(`${method}: ${path}`);

    // Proxy this through to the fMam API
    fMamProxy({
        res,
        req,
        next,
        method,
        route: '/api',
        queryValidator,
        baseUrl: graphQlUrl,
    });
}

export async function entityTypeController(req, res, next) {
    const { path } = req.route;
    const { method } = req;
    console.log(`${method}: ${path}`);
    const { entity } = req.params;
    // Proxy this through to the fMam API
    fMamProxy({
        res,
        req,
        next,
        method: 'POST',
        route: `/omc/v1/entitytype/${entity}`,
        queryValidator,
    });
}
