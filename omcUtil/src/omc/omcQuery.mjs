/**
 * Methods to manipulate or parse OMC entities
 *
 * @module omcQuery
 */

import { makeArray, hasProp } from '../util/util.mjs';

/**
 * Extract nested elements from OMC entities
 *
 * @function extractFromEntity
 * @param entity {object} - An OMC entity
 * @param entityPath {string} - A dot notated string of the path to extract
 * @return {Array}
 */

export function extractFromEntity(entity, entityPath) {
    const entities = makeArray(entity); // Make sure it is iterable
    const levels = entityPath.split('.'); // Split the path on '.'
    const target = levels.shift();
    return entities.flatMap((ent) => {
        if (!hasProp(ent, target)) return null; // If no relevant property return null
        return (levels.length !== 0) // Recurse down, until end of path has been reached
            ? extractFromEntity(ent[target], levels.join('.'))
            : ent[target];
    }).filter((ent) => ent !== null);
}

/**
 * Return all entities of a given entity type
 *
 * @function extractEntity
 * @param {OMC-JSON} omc - An OMC entity
 * @param {string} entityType - A dot notated string of the path to extract
 * @return {omcEntity[]}
 */

export function getEntity(omc, entityType) {
    return omc.filter((ent) => ent.entityType === entityType);
}
