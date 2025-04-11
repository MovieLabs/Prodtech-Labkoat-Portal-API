/**
 * @module omc/identifier
 */

import { customAlphabet } from 'nanoid';

const omcId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 15);

/**
 * Returns a single identifier for the requested identifierScope from an array of OMC identifiers.
 *
 * OMC entities may have multiple identifiers, this returns the identifierValue for a given scope
 *
 * @method identifierOfScope
 * @param {omcIdentifier[]} identifier - An array of OMC identifiers
 * @param identifierScope {string} - The scope of the required identifierValue
 * @return {omcIdentifier} - A single identifier
 */
export const ofScope = ((identifier, identifierScope) => identifier.find((id) => id.identifierScope === identifierScope));

/**
 * Find an entity with a given identifier in a set of OMC-JSON, given an identifier
 *
 * The identifier can contain multiple scopes, and all will be tested against the set of entities
 *
 * @param {OMC-JSON} omc
 * @param {omcIdentifier[]} identifier - An array of OMC identifiers
 * @returns {OMC-JSON | null} - The found entity or []
 */

// Do two identifiers match?
const identifierMatch = ((id1, id2) => (id1.identifierValue === id2.identifierValue) && (id1.identifierScope === id2.identifierScope));

// Given an array of omc entities, return the entity matching the identifier
export function find(omc, identifier) {
    // For each entity in the set, check each of its identifiers against the target identifier
    const matchSingleId = () => {
        const id = Array.isArray(identifier) ? identifier[0] : identifier;
        return omc.find((ent) => (ent?.identifier.find((entId) => identifierMatch(entId, id))));
    };

    // For each entity in the set, check each of its identifiers against all potential target identifiers
    const matchMultipleIds = () => (
        omc.find((ent) => (ent?.identifier.find((entId) => identifier.find((trgId) => identifierMatch(entId, trgId)))
        )));

    if (!identifier || !omc) return null;
    const res = (!Array.isArray(identifier) || identifier.length === 1)
        ? matchSingleId()
        : matchMultipleIds();
    return res || null;
}

/**
 * Generate a unique identifier value with an optional prefix
 *
 * @method generateIdentifier
 * @param {string} identifierScope - The scope of the identifier
 * @param {string} prefix - Optional prefix for the identifier value
 * @returns {string} - A unique identifier value
 */

export function generateIdentifier(identifierScope, prefix = null) {
    const p = prefix ? `${prefix}-` : '';
    return {
        identifierScope,
        identifierValue: `${p}${omcId()}`,
    };
}

/**
 * Generate a unique key by combining the identifierScope and identifierValue
 * @method key
 * @param {omcIdentifier} identifier - An OMC identifier
 * @returns {string} - A unique key
 */
export const key = ((identifier) => `${identifier.identifierScope}:${identifier.identifierValue}`);

/**
 * Merge two sets of identifiers into a single, de-duplicated set
 * Sorting them helps with comparing them in other operations
 *
 * @method merge
 * @param {omcIdentifier[]} target
 * @param {omcIdentifier[]} source
 * @returns {omcIdentifier[]} - A merged set of identifiers
 */
export function merge(target, source) {
    const targetMap = target.reduce((map, id) => {
        return {
            ...map,
            [key(id)]: id,
        };
    }, {});
    const merged = [...target];
    source.forEach((id) => {
        if (!targetMap[key(id)]) merged.push(id);
    });
    return merged.sort((a, b) => a.identifierScope.localeCompare(b.identifierScope));
}
