/**
 Methods for interfacing with the Okta API
 */
import fetch from 'node-fetch';
import { compare } from 'omcUtil';

import config from '../../../config.mjs';

import { serviceToken } from '../../helpers/serviceToken.mjs';
import matchOmcIdentifiers from '../../helpers/matchOmcIdentifiers.mjs';
import yamduCleanup from './yamduCleanup.mjs';
// import dummyData from './dummyData.mjs';

const yamduKey = '93ED8C16638C1F8234C921A8737174D788A1C454A5E3A2F48D97AEFC7E042B32';
const yamduProject = config.YAMDU_PROJECT; // 119374 (Europa with Revisions)
const yamduUrl = config.YAMDU_URL;
const fMamProject = 'Yamdu';
const fMamUrl = config.FMAM_URL;

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

const fMamEndpoint = {
    Character: 'allCharacters',
    NarrativeLocation: 'allNarrativeLocations',
};

async function fMamFetch(entityType) {
    const fMamRoute = fMamEndpoint[entityType];
    const bearerToken = await serviceToken();
    // console.log(bearerToken);
    try {
        // Test the token against a test endpoint on the Labkoat API
        const url = `${fMamUrl}query/${fMamRoute}?project=${fMamProject}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${bearerToken}`,
            },
        };
        console.log(url);
        const res = await fetch(url, options);
        if (res.status === 200) return res.json();
        console.log('Error:', res.statusText, res.status);
        return [];
    } catch (err) {
        console.log(err);
        return null;
    }
}

async function getAllEntities(entityType, identifierScope) {
    const fMamEntities = fMamFetch(entityType);
    const yamduEntities = getYamduEntities(entityType);
    const matchedEntities = matchOmcIdentifiers(await fMamEntities, await yamduEntities, identifierScope);
    return matchedEntities.map((item) => compare(item));
}

async function yamduEvent(req, res) {
    console.log('Path: approval/yamdu');

    const compareCharacter = getAllEntities('Character', 'com.yamdu.app');
    const compareNarLocation = getAllEntities('NarrativeLocation', 'com.yamdu.app');

    const Character = await compareCharacter;
    const NarrativeLocation = await compareNarLocation;

    // const Character = [(compare(dummyData))];

    const omcCompare = {
        Character,
        NarrativeLocation,
    };

    console.log(Character);
    console.log(NarrativeLocation);

    res.json(omcCompare);
}

export default yamduEvent;
