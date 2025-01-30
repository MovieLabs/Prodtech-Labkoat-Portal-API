/**
 Methods for interfacing with the Okta API
 */
import fetch from 'node-fetch';
import { compare } from 'omcUtil';

import fMamFetch from '../fMamFetch.mjs';
import config from '../../../config.mjs';

import matchOmcIdentifiers from '../../helpers/matchOmcIdentifiers.mjs';
import yamduCleanup from './yamduCleanup.mjs';
// import dummyData from './dummyData.mjs';

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

async function getAllEntities(entityType, identifierScope, token) {
    const fMamResponse = await fMamFetch({
        token,
        method: 'GET',
        route: `entityType/${entityType}`,
        // params: '',
        project: fMamProject,
    });

    const yamduResponse = getYamduEntities(entityType);
    const fMamEntities = await fMamResponse;
    const yamduEntities = await yamduResponse;
    if (fMamEntities.status === 200) {
        const matchedEntities = matchOmcIdentifiers(fMamEntities.payload, yamduEntities, identifierScope);
        return matchedEntities.map((item) => compare(item));
    }
    return [];
}

async function yamduApproval(req, res) {
    console.log('Path: approval/yamdu');

    const token = req.headers.authorization?.split(' ')[1];

    const compareCharacter = getAllEntities('Character', 'com.yamdu.app', token);
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

export default yamduApproval;
