import { serviceToken } from 'mlHelpers';
import fetch from 'node-fetch';

import config from '../config.js';
import InternalError from '../errors/InternalError.js';
import InvalidProject from '../errors/InvalidProject.js';

const fMamUrl = config.FMAM_URL;

const queryString = (query) => (
    Object.keys(query)
        .map((key) => `${key}=${query[key]}`)
        .join('&'));

/**
 * Proxy a request to the FMAM service
 * @param res
 * @param req
 * @param next
 * @param method
 * @param route
 * @param queryValidator
 * @returns {Promise<void>}
 */

/**
 * Call fMam and return what it said, without writing a response.
 *
 * The counterpart to {@link fMamProxy}, which commits the response itself and so leaves a caller no
 * chance to act on the outcome. A controller that has work of its own to do — purging a project's
 * stored files once fMam confirms it is gone — needs the result in hand rather than on the wire.
 *
 * Unlike {@link fMamFetch} this does not gate on the hardcoded project map, which is a stale mirror
 * of the project records in fMam and knows nothing about projects added since.
 *
 * @param {Object} params
 * @param {string} params.method - GET, POST, PATCH, DELETE
 * @param {string} params.route - Path below the fMam API root, e.g. `/project`
 * @param {Object} [params.query] - Query parameters
 * @param {Object} [params.body] - Request body, for anything but GET
 * @returns {Promise<{status: number, payload: *}>} fMam's status and parsed body. A transport
 *   failure is reported as a 500 rather than thrown, so a caller has one shape to test
 */
export async function fMamRequest({
    method, route, query = {}, body = null,
}) {
    const url = `${fMamUrl}${route}?${queryString(query)}`;
    const bearerToken = await serviceToken.getToken();

    const options = {
        method,
        headers: { Accept: 'application/json', Authorization: `Bearer ${bearerToken}` },
    };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => null);
        return { status: response.status, payload };
    } catch (err) {
        console.log(err);
        return { status: 500, payload: { error: { details: err.message } } };
    }
}

export async function fMamProxy({
    res,
    req,
    next,
    method, // GET, POST, PUT, DELETE
    route,
    baseUrl = fMamUrl,
}) {
    // Check for valid query parameters
    const {
        query,
        body,
    } = req;

    const url = `${baseUrl}${route}?${queryString({ ...query })}`;
    console.log(`Proxy to: ${url}`);
    const bearerToken = await serviceToken.getToken(); // Use either the provided user token or the service token

    const options = {
        method,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
        },
    };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const fmamResponse = await fetch(url, options);

        // Return the response from the FMAM service to the client
        const payload = await fmamResponse.json();
        res.status(fmamResponse.status)
            .json(payload)
            .end();
    } catch (err) {
        console.log(err);
        next(new InternalError('Database error'));
    }
}

/**
 * Make a request to the FMAM service and return the response
 * @param res
 * @param req
 * @param next
 * @param method
 * @param route
 * @param queryValidator
 * @returns {Promise<void>}
 */

const projectDetails = {
    europa: {
        label: 'Europa',
        db: 'Europa1',
        identifierScope: 'etc',
    },
    europa2: {
        label: 'Europa 2',
        db: 'Europa2',
        identifierScope: 'movielabs.com/omc/europa',
    },
    hsm: {
        label: 'HSM',
        db: 'POC6',
        identifierScope: 'labkoat',
    },
    rebelFleet: {
        label: 'Rebel Fleet',
        db: 'RebelFleet',
        identifierScope: 'Europa',
    },
    yamdu: {
        label: 'Yamdu',
        db: 'Yamdu',
        identifierScope: 'com.yamdu.app',
    },
    nbc: {
        label: 'NBC/U',
        db: 'NBC',
        identifierScope: 'fast8',
    },
    filmustage: {
        label: 'Film-U-Stage',
        db: 'filmustage',
        identifierScope: 'com.filmustage.app',
    },
};

export async function fMamFetch({
    next,
    method, // GET, POST, PUT, DELETE, PATCH
    route,
    query,
    body,
}) {
    // Check for valid project
    const { project } = query;
    const projectDb = projectDetails[project]?.db;
    if (!projectDb) {
        next(new InvalidProject(project));
        return { status: 400 };
    }

    const url = `${fMamUrl}${route}?${queryString({ ...query, ...{ project: projectDb } })}`;
    const bearerToken = await serviceToken.getToken(); // Use either the provided user token or the service token

    const options = {
        method,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
        },
    };

    // Add body to the request if it exists and appropriate method
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const fmamResponse = await fetch(url, options);

        // Return the response from the FMAM service to the client
        const payload = await fmamResponse.json();
        return {
            status: fmamResponse.status,
            payload: payload.data,
        };
    } catch (err) {
        return {
            status: 500,
            payload: 'Database error',
        };
    }
}
