/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

import { fMamProxy } from '../fMamFetch.mjs';

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

// export async function updateController(req, res, next) {
//     const { path } = req.route;
//     const { method } = req;
//     console.log(`${method}: ${path}`);
//
//     // Proxy this through to the fMam API
//     fMamProxy({
//         res,
//         req,
//         next,
//         method: 'POST',
//         route: '/omc/v1/update',
//         queryValidator,
//     });
// }
//
// export async function removeController(req, res, next) {
//     const { path } = req.route;
//     const { method } = req;
//     console.log(`${method}: ${path}`);
//
//     // Proxy this through to the fMam API
//     fMamProxy({
//         res,
//         req,
//         next,
//         method: 'DELETE',
//         route: '/omc/v1/update',
//         queryValidator,
//     });
// }
