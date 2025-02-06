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

async function entityController(req, res, next) {
    console.log('GET: /omc/entity');

    // Proxy this through to the fMam API
    fMamProxy({
        res,
        req,
        next,
        method: 'GET',
        route: 'identifier',
        queryValidator,
    });
}

async function updateController(req, res, next) {
    console.log('POST: omc/update');

    // Proxy this through to the fMam API
    fMamProxy({
        res,
        req,
        next,
        method: 'POST',
        route: 'update',
        queryValidator,
    });
}

async function removeController(req, res, next) {
    console.log('DELETE: omc/update');

    // Proxy this through to the fMam API
    fMamProxy({
        res,
        req,
        next,
        method: 'DELETE',
        route: 'update',
        queryValidator,
    });
}

export {
    entityController,
    updateController,
    removeController,
};
