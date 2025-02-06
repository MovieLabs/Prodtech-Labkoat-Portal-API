/**
 Methods for interfacing with the Okta API
 */
import fetch from 'node-fetch';
import { compare } from 'omcUtil';

import { fMamFetch } from '../fMamFetch.mjs';
import config from '../../../config.mjs';

import matchOmcIdentifiers from '../../helpers/matchOmcIdentifiers.mjs';
import mergeContext from '../../helpers/mergeContext.mjs';
import yamduCleanup from './yamduCleanup.mjs';
// import dummyData from './dummyData.mjs';

let yamduKey = null;
const yamduProject = config.YAMDU_PROJECT; // 119374 (Europa with Revisions)
const yamduUrl = config.YAMDU_URL;
const fMamProject = 'yamdu';

export function yamduSetup(secrets) {
    yamduKey = secrets.LABKOAT.YAMDU_KEY;
    console.log('Yamdu key set', yamduKey);
}

async function yamduFetch(yamduRoute) {
    try {
        // Test the token against a token-exchange endpoint on the Labkoat API
        const url = `${yamduUrl}${yamduRoute}?key=${yamduKey}&project=${yamduProject}`;
        const options = {
            method: 'GET',
            headers: {
                Accept: 'application/json',
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
    // CreativeWork: 'allCreativeWorks',
    Effect: 'allEffects',
    NarrativeAudio: 'allNarrativeAudios',
    NarrativeLocation: 'allNarrativeLocations',
    NarrativeObject: 'allNarrativeObjects',
    NarrativeScene: 'allNarrativeScenes',
    NarrativeWardrobe: 'allNarrativeWardrobes',
    ProductionLocation: 'allProductionLocations',
    // ProductionScene: 'allProductionScenes',
    SpecialAction: 'allSpecialActions',
};

async function getYamduEntities(entityType) {
    const endpoint = yamduEndpoint[entityType];
    const rawData = await yamduFetch(endpoint);
    const yamduData = yamduCleanup(rawData);
    console.log(`Received ${entityType} data from Yamdu`);
    return yamduData[entityType];
}

// Make requests to the fMam API for a given entity type
async function getAllEntities(entityType, identifierScope, next) {
    const yamduResponse = getYamduEntities(entityType);
    const fMamEntities = await fMamFetch({
        next,
        method: 'GET',
        route: `entityType/${entityType}`,
        query: {
            project: fMamProject,
        },
    });
    console.log(`Received ${entityType} data from fMam`);

    const yamduEntities = await yamduResponse;

    if (fMamEntities.status === 200) {
        const matchedEntities = matchOmcIdentifiers(fMamEntities.payload, yamduEntities, identifierScope);
        const mergedContext = matchedEntities.map((item) => mergeContext(item, identifierScope));
        const diffEntities = mergedContext.map((item) => compare(item));

        return { [entityType]: diffEntities };
        // return { [entityType]: matchedEntities.map((item) => compare(item)) };
    }
    console.log(`Error fetching ${entityType}`);
    return { [entityType]: [] };
}

export async function yamduController(req, res, next) {
    console.log('Path: approval/yamdu');

    const entityPromise = Object.keys(yamduEndpoint).map((entityType) => getAllEntities(entityType, 'com.yamdu.app', next));
    const omcMatched = await Promise.all(entityPromise);
    const omcCompare = omcMatched.reduce((acc, item) => ({ ...acc, ...item }), {});
    res.json(omcCompare);
}
