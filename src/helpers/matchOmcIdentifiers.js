// Create a key value using the scope and value of an identifier
const idKey = ((identifier) => `${identifier.identifierScope}:${identifier.identifierValue}`);

const identifierMap = ((omc, scope) => {
    const map = {};
    omc.forEach((ent) => {
        const idOfScope = ent.identifier.find((id) => id.identifierScope === scope);
        // const key = idOfScope.identifierValue;
        map[idKey(idOfScope)] = ent;
    });
    return map;
});

/**
 * Take an array of paired OMC entities and merge identifiers from the original into the updated entity
 *
 * @param pairs
 */

function mergeOmcIdentifiers(pairs) {
    return pairs.map(({
        original,
        updated,
    }) => {
        const oIds = original.identifier.reduce((idMap, id) => ({
            ...idMap,
            [idKey(id)]: id,
        }), {});

        const uIds = updated.identifier.reduce((idMap, id) => ({
            ...idMap,
            [idKey(id)]: id,
        }), oIds);

        return {
            original,
            updated: { ...updated, ...{ identifier: Object.values(uIds) } },
        };
    });
}

/**
 * Match two sets of OMC entities based on their identifiers
 *
 * Useful prior to comparing large sets of entities prior to comparing, merging or updating them
 *
 * @param original
 * @param updated
 * @param identifierScope
 * @returns {*[]}
 */

function matchOmcIdentifiers(original, updated, identifierScope) {
    const oMap = identifierMap(original, identifierScope);
    const uMap = identifierMap(updated, identifierScope);

    const matchedEnt = {};
    const oKeys = Object.keys(oMap);

    // Create a map of matched entities
    oKeys.forEach((key) => {
        matchedEnt[key] = {
            original: oMap[key],
            updated: uMap[key] ? uMap[key] : null,
        };
    });

    // Add any unmatched entities to the result set entity map
    const uKeys = Object.keys(uMap);
    uKeys.forEach((key) => {
        if (!matchedEnt[key]) {
            matchedEnt[key] = {
                original: null,
                updated: uMap[key],
            };
        }
    });

    // Format the result set as an array with the original entity first
    const format = Object.keys(matchedEnt)
        .map((key) => matchedEnt[key]);

    const merged = mergeOmcIdentifiers(format);
    return merged;
}

module.exports = matchOmcIdentifiers;
