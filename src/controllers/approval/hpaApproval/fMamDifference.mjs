import {
    compare,
    transform as omcTransform,
    identifier as omcIdentifier,
} from 'omcUtil';

import { fMamFetch } from '../../fMamFetch.mjs';
import { shootDay } from './shootDay.mjs';
import { creativeWork, cwnsContext } from './creativeWork.mjs';
import productionScene from './productionScene.mjs';

const fMamProject = 'europa2';

// Make a fetch request to the fMam API for a given identifier
function getfMamContext(omc, next) {
    if (!omc || !omc.length) return null;

    return omc.map(async (ent) => {
        const { identifier } = ent;
        const { identifierScope, identifierValue } = identifier[0];
        const fRes = await fMamFetch({
            next,
            method: 'GET',
            route: '/omc/v1/identifier',
            query: {
                project: fMamProject,
                identifierScope,
                identifierValue,
            },
        });
        if (fRes.status === 200) {
            return Array.isArray(fRes.payload) ? (fRes.payload[0] || null) : fRes.payload;
        }
        return null;
    });
}

// Make a fetch request to the fMam API for a given entity type
async function getfMamEntity(entityType, next) {
    const fRes = await fMamFetch({
        next,
        method: 'GET',
        route: `/omc/v1/entityType/${entityType}`,
        query: {
            project: fMamProject,
        },
    });
    console.log(`Received ${entityType} data from fMam`);
    return fRes.status === 200 ? { [entityType]: fRes.payload } : {};
}

// Create a mapping table of identifiers, given an array of omc identifiers
// Can be merged with an existing map, if provided
const identifierMap = ((identifier, init = {}) => identifier.reduce((idMap, id) => ({
    ...idMap,
    [omcIdentifier.key(id)]: id,
}), init));

function mergeEntityIdentifiers({ original, comparison }) {
    // If there was no matching entity in the original set, return it as is
    if (!original || !comparison) return { original, comparison };

    const oIds = identifierMap(original.identifier);
    const uIds = identifierMap(comparison.identifier, oIds);

    return {
        original: { ...original, ...{ identifier: Object.values(uIds) } },
        comparison: { ...comparison, ...{ identifier: Object.values(uIds) } },
    };
}

function compareSources({ original: source1, comparison: source2 }) {
    // Join the Yamdu and fMam entityTypes into a single set
    const entityTypes = new Set(Object.keys(source1).concat(Object.keys(source2)));

    // Compare the contents of the fMam with the Yamdu entities, creating diff's
    const entityDiff = {}
    entityTypes.forEach((entityType) => {
        const src2Arr = [...source2[entityType]]; // I want new array
        entityDiff[entityType] = source1[entityType].map((src1Ent) => {
            const original = omcIdentifier.find((src2Arr || []), src1Ent.identifier); // Find the matching entity in the fMam (if it exists)
            if (original) { // If the entity exists in both sets, remove it from the fMam array so it is not matched again
                const index = src2Arr.findIndex((ent) => ent.identifier[0].identifierValue === original.identifier[0].identifierValue);
                src2Arr.splice(index, 1);
            }
            return compare(mergeEntityIdentifiers({ original, comparison: src1Ent }));
        });
        src2Arr.forEach((fMamEnt) => { // Things not present in Yamdu, but in fMam (e.g. to be deleted)
            entityDiff[entityType].push(compare({ original: fMamEnt, comparison: null }));
        })
    });
    return entityDiff;
}


// Make requests to the fMam API for a given entity type
export default async function fMamDifference(yamduOmc, next) {
    const yamduObj = omcTransform.toObject(yamduOmc);
    yamduObj.Context.push(cwnsContext); // Add the CreativeWork has NarrativeScene Contexts to Yamdu

    // Retrieve the entities of entityType and any intrinsically related entities (but ignore the Context)
    const retrieveEntities = Object.keys(yamduObj)
        .filter((key) => key !== 'Context');
    const fMamEntPromise = retrieveEntities.map((entT) => getfMamEntity(entT, next));
    const fMamCxtPromise = getfMamContext(yamduObj.Context); // Retrieve the Context entities from the fMam
    const fMamResponse = await Promise.all(fMamEntPromise);
    fMamResponse.push({ Context: await Promise.all(fMamCxtPromise) }); // Add the Context entities to the response

    const fMamEntities = fMamResponse.reduce((acc, item) => ({ ...acc, ...item }), {});

    shootDay(yamduObj.NarrativeScene, fMamEntities.NarrativeScene); // Add the shoot day Contexts to Yamdu;
    creativeWork(yamduObj); // Update the CreativeWork has NarrativeScene context
    productionScene(yamduObj, fMamEntities); // Add the ProductionScene Contexts to Yamdu

    return compareSources({ original: yamduObj, comparison: fMamEntities })
}
