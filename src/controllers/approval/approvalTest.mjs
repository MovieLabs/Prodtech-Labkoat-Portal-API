/**
 Methods for interfacing with the Okta API
 */
import fetch from 'node-fetch';
import { compare } from 'omcUtil';

import config from '../../../config.mjs';

import { serviceToken } from '../../helpers/serviceToken.mjs';
import fMamFetch from '../fMamFetch.mjs';
import matchOmcIdentifiers from '../../helpers/matchOmcIdentifiers.mjs';
import yamduCleanup from './yamduCleanup.mjs';

const yamduKey = '93ED8C16638C1F8234C921A8737174D788A1C454A5E3A2F48D97AEFC7E042B32';
const yamduProject = config.YAMDU_PROJECT; // 119374 (Europa with Revisions)
const yamduUrl = config.YAMDU_URL;
const fMamProject = 'yamdu';

async function yamduFetch(yamduRoute) {
    try {
        // Test the token against a test endpoint on the Labkoat API
        const url = `${yamduUrl}${yamduRoute}?key=${yamduKey}&project=${yamduProject}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                // Authorization: `Basic ${exchangeToken}`,
                // 'content-type': 'application/x-www-form-urlencoded',
            },
        };
        console.log(url);
        const res = await fetch(url, options);
        return res.json();
    } catch (err) {
        console.log(err);
        return null;
    }
}

const yamduEndpoint = {
    Character: 'allCharacters',
    NarrativeLocation: 'allNarrativeLocations',
};

async function getYamduEntities(entityType) {
    const endpoint = yamduEndpoint[entityType];
    const rawData = await yamduFetch(endpoint);
    const yamduData = yamduCleanup(rawData);
    return yamduData[entityType];
}

async function getAllEntities(entityType, identifierScope) {
    const fMamEntities = fMamFetch(entityType);
    const yamduEntities = getYamduEntities(entityType);
    const matchedEntities = matchOmcIdentifiers(await fMamEntities, await yamduEntities, identifierScope);
    return matchedEntities.map((item) => compare(item));
}

async function yamduEvent(req, res) {
    console.log('Path: approval/test');

    const entityType = 'Character';
    const fmamResponse = await fMamFetch({
        method: 'GET',
        route: `entitytype/${entityType}`,
        params: 'instanceInfo=true',
        project: fMamProject,
    });
    res.status(fmamResponse.status).json(fmamResponse.payload);
}

export default yamduEvent;
