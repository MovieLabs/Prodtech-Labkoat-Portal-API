/**
 Methods for interfacing with the Okta API
 */
import fetch from 'node-fetch';
import crypto from 'node:crypto';
import { compare } from 'omcUtil';

import { fMamFetch } from '../fMamFetch.mjs';
import config from '../../../config.mjs';

import { matchOmcIdentifiers, mergeOmcIdentifiers } from '../../helpers/matchOmcIdentifiers.mjs';
import mergeContext from '../../helpers/mergeContext.mjs';
import yamduCleanup from './yamduCleanup.mjs';

let yamduKey = null;
const yamduProject = config.YAMDU_PROJECT; // 119374 (Europa with Revisions)
const yamduUrl = config.YAMDU_URL;
const fMamProject = 'yamdu';

export function yamduSetup(secrets) {
    yamduKey = secrets.LABKOAT.YAMDU_KEY;
    console.log('Yamdu key set', yamduKey);
}

const hashString = (idString) => {
    return crypto.createHash('md5')
        .update(idString)
        .digest('hex');
};

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

// This is the identifier for the Creative Work Context, it is used as a special case fix temporarily
const cwConextEnt = {
    identifier: [
        {
            identifierScope: 'com.yamdu.app',
            identifierValue: 'cxt-93mGPOi2YCQj7zO',
        },
    ],
};

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
    // CreativeWork: 'allCreativeWorks',
    // ProductionScene: 'allProductionScenes',
};

const intrinsicProps = ((ent) => Object.keys(ent)
    .filter((key) => key[0] !== key[0].toLowerCase()));

function getfMamContext(omc, next) {
    if (!omc || !omc.length) return [];
    return omc.map(async (ent) => {
        const { identifier } = ent;
        const { identifierScope } = identifier[0];
        const { identifierValue } = identifier[0];
        const context = await fMamFetch({
            next,
            method: 'GET',
            route: 'identifier',
            query: {
                project: fMamProject,
                identifierScope,
                identifierValue,
            },
        });
        return {
            original: Array.isArray(context.payload) ? context.payload[0] : context.payload,
            comparison: ent,
        };
    });
}

async function getfMamEntity(entityType, next) {
    console.log(`fMam entity Request for ${entityType}`);
    const fRes = await fMamFetch({
        next,
        method: 'GET',
        route: `entityType/${entityType}`,
        query: {
            project: fMamProject,
        },
    });
    return fRes.status === 200 ? { [entityType]: fRes.payload } : {};
}

function setNarrativeSceneCxt(NarrativeScene, ProductionScene) {
    const psMap = ProductionScene.reduce((acc, item) => {
        const ent = item.comparison || item.original; // The Production Scene entity
        const nsNumber = ent.sceneNumber.split('-')[0]; // Production Scene number
        const scenes = acc[nsNumber]
            ? [...acc[nsNumber], { identifier: ent.identifier }]
            : [{ identifier: ent.identifier }];
        return { ...acc, ...{ [nsNumber]: scenes } };
    });

    const cxt = [];
    const narScene = NarrativeScene.map((item) => {
        const ent = item.comparison || item.original; // The NarrativeScene entity
        const nsNumber = ent.sceneName?.fullName;
        // Create an identifier for the ProductionScene Context
        const cxtId = hashString(`NarrativeScene-${nsNumber}`);
        const cxtIdentifier = {
            identifierScope: 'movielabs.com/omc/yamdu',
            identifierValue: `cxt-${cxtId}`,
        };

        // Create the Context relating a ProductionScene to it's Slates
        const cxtItem = {
            schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
            entityType: 'Context',
            identifier: [cxtIdentifier],
            name: 'narrativeScene-productionScene',
            description: `Production Scenes for Narrative Scene: ${nsNumber}`,
            contextType: 'narrative',
            contextCategory: 'narrativeScene-productionScene',
            has: {
                ProductionScene: psMap[nsNumber] || [],
            },
        };
        cxt.push(compare({ original: null, comparison: cxtItem })); // Create an item with diff (assume no original)

        const cleanCxt = ent.Context.filter((c) => c.identifier[0].identifierValue !== `cxt-${cxtId}`);
        ent.Context = [...cleanCxt, { identifier: [cxtIdentifier] }]; // Add the Context to the NarrativeScene
        // ent.Context.push({ identifier: [cxtIdentifier] }); // Add the Context to the ProductionScene
        return compare(item); // Re-Diff these as a Context has been added
    });

    return { NarrativeScene: narScene, Context: cxt };
}

// This is a special case fix for the Creative Work Context that links to the Narrative Scenes
function setCWContext(cwCxt, NarrativeScene) {
    const cwFeatures = NarrativeScene.sort((a, b) => parseInt(a.sceneNumber, 10) - parseInt(b.sceneNumber, 10))
        .map((ent) => ({ identifier: ent.identifier }));
    const comparison = { ...cwCxt.original };
    comparison.has = { NarrativeScene: cwFeatures };
    return {
        original: cwCxt.original,
        comparison,
    };
}

async function getYamduEntities(entityType, next) {
    const endpoint = yamduEndpoint[entityType];
    const rawData = await yamduFetch(endpoint);
    console.log(`Received ${entityType} data from Yamdu`);
    const yamduData = await yamduCleanup(rawData, next);

    const ik = yamduData[entityType].length ? intrinsicProps(yamduData[entityType][0]) : [];
    const intrinsicKeys = ik.filter((key) => yamduData[key]); // Filter out intrinsic keys where there is no data
    intrinsicKeys.push(entityType);
    return intrinsicKeys.reduce((obj, key) => ({
        ...obj,
        [key]: yamduData[key] || [],
    }), {});
}

// Make requests to the fMam API for a given entity type
async function getAllEntities(entityType, identifierScope, next) {
    const yamduResponse = await getYamduEntities(entityType, next);

    // Retrieve the entities of entityType and any intrinsically related entities (but ignore the Context)
    const retrieveEntities = Object.keys(yamduResponse)
        .filter((key) => key !== 'Context');
    const fMamPromise = retrieveEntities.map((entT) => getfMamEntity(entT, next));
    const fMamResponse = await Promise.all(fMamPromise);
    const fMamEntities = fMamResponse.reduce((acc, item) => ({ ...acc, ...item }), {});

    const fMamCxtPromise = await Promise.all(getfMamContext(yamduResponse.Context));

    // Special case fix for the Creative Work Context that links to the Narrative Scenes
    if (yamduResponse.NarrativeScene) {
        const cwContext = await Promise.all(getfMamContext([cwConextEnt], next));
        const cwCxt = setCWContext(cwContext[0], yamduResponse.NarrativeScene);
        fMamCxtPromise.push(cwCxt);
    }

    const mergedCxt = mergeOmcIdentifiers(fMamCxtPromise);
    const cxtDiff = mergedCxt.map((item) => compare(item));

    const final = Object.keys(fMamEntities)
        .reduce((obj, key) => {
            const matchedEntities = matchOmcIdentifiers(fMamEntities[key], yamduResponse[key], identifierScope);
            const mergedContext = matchedEntities.map((item) => mergeContext(item, identifierScope));
            const diffEntities = mergedContext.map((item) => compare(item));
            return {
                ...obj,
                [key]: diffEntities,
            };
        }, { Context: cxtDiff });
    return final;
}

export async function yamduController(req, res, next) {
    console.log('Path: approval/yamdu');

    const entityPromise = Object.keys(yamduEndpoint)
        .map((entityType) => getAllEntities(entityType, 'com.yamdu.app', next));
    const omcMatched = await Promise.all(entityPromise);
    const omcCompare = omcMatched.reduce((acc, item) => {
        Object.keys(item)
            .forEach((key) => {
                acc[key] = [...(acc[key] || []), ...item[key]];
            });
        return acc;
    }, {});
    if (omcCompare.NarrativeScene && omcCompare.ProductionScene) {
        // Brute force a Context to link Narrative Scene to Production Scene
        const { NarrativeScene, Context } = setNarrativeSceneCxt(omcCompare.NarrativeScene, omcCompare.ProductionScene);
        omcCompare.NarrativeScene = NarrativeScene;
        omcCompare.Context = [...omcCompare.Context, ...Context];
    }
    res.json(omcCompare);
}
