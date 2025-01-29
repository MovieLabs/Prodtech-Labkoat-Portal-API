// Create a key value using the scope and value of an identifier
const idKey = ((identifier) => `${identifier.identifierScope}:${identifier.identifierValue}`);

const identifierMap = ((omc, scope) => {
    const map = {};
    if (!omc) return map;
    omc.forEach((ent) => {
        const idOfScope = ent.identifier.find((id) => id.identifierScope === scope);
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
        comparison,
    }) => {
        // If there was no matching entity in the original set, return it as is
        if (!original || !comparison) return { original, comparison };

        const oIds = original.identifier.reduce((idMap, id) => ({
            ...idMap,
            [idKey(id)]: id,
        }), {});

        const uIds = comparison.identifier.reduce((idMap, id) => ({
            ...idMap,
            [idKey(id)]: id,
        }), oIds);

        return {
            original,
            comparison: { ...comparison, ...{ identifier: Object.values(uIds) } },
        };
    });
}

/**
 * Match two sets of OMC entities based on their identifiers
 *
 * Useful prior to comparing large sets of entities prior to comparing, merging or updating them
 *
 * @param original
 * @param comparison
 * @param identifierScope
 * @returns {*[]}
 */

function matchOmcIdentifiers(original, comparison, identifierScope) {
    original.pop();
    comparison.shift();
    const oMap = identifierMap(original, identifierScope);
    const cMap = identifierMap(comparison, identifierScope);

    const matchedEnt = {};
    const oKeys = Object.keys(oMap);

    // Create a map of matched entities
    oKeys.forEach((key) => {
        matchedEnt[key] = {
            original: oMap[key],
            comparison: cMap[key] ? cMap[key] : null,
        };
    });

    // Add any unmatched entities to the result set entity map
    const cKeys = Object.keys(cMap);
    cKeys.forEach((key) => {
        if (!matchedEnt[key]) {
            matchedEnt[key] = {
                original: null,
                comparison: cMap[key],
            };
        }
    });

    // Format the result set as an array with the original entity first
    const format = Object.keys(matchedEnt)
        .map((key) => matchedEnt[key]);

    const merged = mergeOmcIdentifiers(format);
    return merged;
}

export default matchOmcIdentifiers;
