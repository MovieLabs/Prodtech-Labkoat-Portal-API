/**
 Methods for interfacing with the Okta API
 */
import fetch from 'node-fetch';
import { transform as omcTransform } from 'omcUtil';
import config from '../../../../config.mjs';

import yamduCleanup from './yamduCleanup.mjs';
import { addContext } from './inverseRelationship.mjs';
import { depiction } from './depiction.mjs';

const primaryScope = 'com.yamdu.app';
let yamduKey = null;
const yamduProject = config.YAMDU_PROJECT; // 119374 (Europa with Revisions)
const yamduUrl = config.YAMDU_URL;

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
        // console.log(url);
        const res = await fetch(url, options);
        return res.json();
    } catch (err) {
        console.log(err);
        return null;
    }
}

const yamduEndpoint = {
    Character: 'allCharacters',
    Effect: 'allEffects',
    NarrativeAudio: 'allNarrativeAudios',
    NarrativeLocation: 'allNarrativeLocations',
    NarrativeObject: 'allNarrativeObjects',
    NarrativeScene: 'allNarrativeScenes',
    NarrativeWardrobe: 'allNarrativeWardrobes',
    ProductionLocation: 'allProductionLocations',
    SpecialAction: 'allSpecialActions',
    ProductionScene: 'allProductionScenes',
};

async function getYamduEntities(entityType, next) {
    const endpoint = yamduEndpoint[entityType];
    const rawData = await yamduFetch(endpoint);
    console.log(`Received ${entityType} data from Yamdu`);
    const yamduData = yamduCleanup(rawData, next);
    return yamduData;
}

export default async function (req, res, next) {
    const entityPromise = Object.keys(yamduEndpoint)
        .map((entityType) => getYamduEntities(entityType, next));
    const yamduData = await Promise.all(entityPromise);

    const character = yamduData.filter((d) => Object.keys(d).includes('Character'));
    depiction(character[0]);

    const allYamdu = yamduData.flatMap((omc) => omcTransform.toArray(omc));
    addContext(allYamdu, primaryScope);
    return allYamdu;
}
