import { serviceToken } from '../helpers/serviceToken.mjs';
import fetch from 'node-fetch';
import config from '../../config.mjs';

const fMamUrl = config.FMAM_URL;

const projectDetails = {
    europa: {
        label: 'Europa',
        db: 'Europa1',
        identifierScope: 'etc',
        root: {
            identifierScope: 'etc',
            identifierValue: 'cw-6zs2nlw2YKuNBX4',
        },
    },
    hsm: {
        label: 'HSM',
        db: 'POC6',
        identifierScope: 'labkoat',
        root: {
            identifierScope: 'labkoat',
            identifierValue: 'cw/hlDTz5s8IStbxWvdRVfSh',
        },
    },
    rebelFleet: {
        label: 'Rebel Fleet',
        db: 'RebelFleet',
        identifierScope: 'Europa',
        root: {
            identifierScope: 'Europa',
            identifierValue: 'cw-e84f2b8c6cc879b4314b2c83d871599c',
        },
    },
    yamdu: {
        label: 'Yamdu',
        db: 'Yamdu',
        identifierScope: 'com.yamdu.app',
        root: {
            identifierScope: 'com.yamdu.app',
            identifierValue: 'cw-6zs2nlw2YKuNBX4',
        },
    },
    nbc: {
        label: 'NBC/U',
        db: 'NBC',
        identifierScope: 'fast8',
        root: {
            identifierScope: 'fast8',
            identifierValue: '4:250933a5-fc16-4ecb-96c9-107da5d29f57:898',
        },
    },
};

export default async function fMamFetch({
    token = null, // Optional user token
    method, // GET, POST, PUT, DELETE
    route,
    params = '',
    body = null, // Optional body for POST and PUT, will be stringified
    project, // Project name
}) {
    const bearerToken = token || await serviceToken(); // Use either the provided user token or the service token

    const projectDb = projectDetails[project]?.db;
    if (!projectDb) {
        console.log(`Error: Project not found: ${project}`);
        return {
            status: 404,
            payload: { message: `Project not found: ${project}` },
        };
    }

    const url = `${fMamUrl}${route}?project=${projectDb}&${params}`;
    // console.log(url);
    const options = {
        method,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
        },
    };
    if (body && method !== 'GET') options.body = JSON.stringify(body);

    try {
        const fmamResponse = await fetch(url, options);
        const payload = await fmamResponse.json();
        if (fmamResponse.status === 200) {
            return {
                status: 200,
                payload,
            };
        }
        console.log(`Error: ${payload.message}`);
        return {
            status: fmamResponse.status,
            payload: payload.message || 'Database error',
        };
    } catch (err) {
        console.log(err);
        console.log('Error:  Database failed to respond');
        return {
            status: 500,
            payload: { message: 'Internal error: Database failed to respond' },
        };
    }
}
