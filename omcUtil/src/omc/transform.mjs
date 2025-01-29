/**
 * A set of methods for transforming and manipulating OMC-JSON
 *
 * @module omcTransform
 */

import assert from 'node:assert';
import { hasProp } from '../util/util.mjs';

import generateId from './generateID.mjs';

/**
 * Strip the graphQl wrapper from a graphQl response and return the OMC-JSON
 *
 * @function stripGraphQl
 * @param {Object} query
 * @param {OMC-JSON} query.data - Valid OMC-JSON
 * @return {OMC-JSON}
 */

export function stripGraphQl(query) {
    if (!hasProp(query, 'data')) {
        console.log('Problem');
    }
    const { data } = query;
    return Object.keys(data).flatMap((key) => data[key]);
}

/**
 * De-Duplicate a set of entities based on their shared identifiers
 *
 * @function deDuplicate
 * @param {OMC-JSON} omc - Valid OMC-JSON
 * @return {OMC-JSON}
 */

const assertEqual = ((a, b) => {
    try {
        assert.deepStrictEqual(a, b);
        return true;
    } catch (err) {
        return false;
    }
});

export function deDuplicate(omc) {
    if (!omc) return null;
    const deDupe = {};
    const idMapping = {};
    omc.forEach((ent) => {
        const { identifier } = ent;
        const mappingId = generateId(); // A temporary singular id for the entity, used to track duplicates
        identifier.forEach(({
            identifierScope,
            identifierValue,
        }) => {
            const uid = `${identifierScope}-${identifierValue}`;
            if (!hasProp(idMapping, uid)) {
                idMapping[uid] = mappingId; // First time seeing this identifier, so map it to the singular id
            }
            const mapId = idMapping[uid]; // Get the singular id for this identifier
            if (hasProp(deDupe, mapId)) { // Is there already an entity with this identifier?
                if (!assertEqual(deDupe[mapId], ent)) {
                    const a = JSON.stringify(deDupe[mapId]); // ToDo: Do some business logic here
                    const b = JSON.stringify(ent);
                    const msg = b > a ? 'New is greater (maybe swap)' : 'Existing looks best';
                    console.log(`Same identifier, but entities not equal: ${msg}`);
                }
            } else {
                deDupe[mapId] = ent; // First time seeing this, so add the entity to the deDupe object
            }
        });
    });
    return Object.values(deDupe);
}

/**
 * Convert OMC-JSON from an array or single instance to the OMC object(map) format
 *
 * @function toObject
 * @param {OMC-JSON} omc - Valid OMC-JSON
 * @return {OMC-JSON}
 */

export function toObject(omc) {
    if (!omc) return null;
    if (Array.isArray(omc)) {
        return omc.reduce((obj, ent) => {
            const { entityType } = ent;
            if (entityType) {
                obj[entityType] = obj[entityType] || [];
                obj[entityType].push(ent);
            }
            return obj;
        }, {});
    }
    if (omc.entityType) return { [omc.entityType]: [omc] };
    return omc;
}

/**
 * Convert OMC-JSON in an array from the object(map) format
 *
 * @function toArray
 * @param {OMC-JSON} omc - Valid OMC-JSON
 * @return {OMC-JSON} - OMC-JSON in the Array format
 */

export function toArray(omc) {
    if (!omc) return null;
    if (hasProp(omc, 'entityType')) return [omc]; // Single instance
    if (!Array.isArray(omc)) {
        const omcKeys = Object.keys(omc);
        return omcKeys.flatMap((entityType) => omc[entityType]);
    }
    return omc;
}

/**
 * Created flattened OMC-JSON where the existing entities may have embedded nested entities
 * This function will replace the nested entities with a reference to the entity
 *
 * @function unEmbed
 * @param {OMC-JSON} omc - Valid OMC-JSON
 * @return {OMC-JSON} - OMC-JSON with all nested entities replaced with a reference and the entities at the top level of the array
 */

function unEmbedEnt(omc) {
    const stash = [];

    const traverse = ((ent) => {
        if (!Array.isArray(ent) && (typeof ent !== 'object' || ent === null)) {
            return ent; // Down to a primitive, null or undefined, so we are at a leaf
        }

        const refEnt = { ...ent }; // Clone the entity, so we don't mutate the original
        const refKeys = Object.keys(refEnt);
        refKeys.forEach((refKey) => {
            refEnt[refKey] = (Array.isArray(refEnt[refKey]))
                ? refEnt[refKey].flatMap((e1) => traverse(e1)) // Array of values: traverse each one
                : traverse(refEnt[refKey]); // Single value: traverse it
        });
        if (!hasProp(refEnt, 'entityType')) return refEnt; // Not an entity, so return it
        stash.push(refEnt); // Add the entity to the stash
        return { identifier: refEnt.identifier }; // Return a reference to the entity
    });

    traverse(omc);
    return stash;
}

// Migrate a set of entities
const unEmbedSet = ((omc) => {
    const entSet = omc.flatMap((ent) => unEmbedEnt(ent));
    return deDuplicate(entSet);
});

export function unEmbed(omc) {
    if (!omc) return null;
    if (Array.isArray(omc)) return unEmbedSet(omc); // Array of instances
    if (hasProp(omc, 'entityType')) return unEmbedEnt(omc); // Single instance
    const omcSet = unEmbedSet(toArray(omc)); // Object(map) of omc instances
    return toObject(omcSet);
}
