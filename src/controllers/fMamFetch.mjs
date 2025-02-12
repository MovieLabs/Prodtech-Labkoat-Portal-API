import fetch from 'node-fetch';

import { serviceToken } from '../helpers/serviceToken.mjs';
import config from '../../config.mjs';
import InvalidProject from '../errors/InvalidProject.mjs';
import InternalError from '../errors/InternalError.mjs';

const fMamUrl = config.FMAM_URL;

const projectDetails = {
    europa: {
        label: 'Europa',
        db: 'Europa1',
        identifierScope: 'etc',
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

export async function fMamProxy({
    res,
    req,
    next,
    method, // GET, POST, PUT, DELETE
    route,
}) {
    // Check for valid query parameters
    const {
        query,
        body,
    } = req;

    // Check for valid project
    const { project } = query;
    const projectDb = projectDetails[project]?.db;
    if (!projectDb) {
        next(new InvalidProject(project));
        return;
    }

    const url = `${fMamUrl}${route}?${queryString({ ...query, ...{ project: projectDb } })}`;
    const bearerToken = await serviceToken(); // Use either the provided user token or the service token
    // const token = req.headers.authorization?.split(' ')[1];
    console.log(url);

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
        console.log(fmamResponse.status);
        res.status(fmamResponse.status)
            .json(payload)
            .end();
    } catch (err) {
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
export async function fMamFetch({
    next,
    method, // GET, POST, PUT, DELETE
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
    const bearerToken = await serviceToken(); // Use either the provided user token or the service token
    // const token = req.headers.authorization?.split(' ')[1];
    // console.log(url);

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
            payload,
        };
    } catch (err) {
        return {
            status: 500,
            payload: 'Database error',
        };
    }
}
