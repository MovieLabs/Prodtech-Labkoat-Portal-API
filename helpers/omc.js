/**
 * Methods to manipulate or parse OMC entities
 * @module
 */

const { makeArray, hasProp } = require('./util');

/**
 * Extract nested elements from OMC entities
 * @param entity {object} - An OMC entity
 * @param entityPath {string} - A dot notated string of the path to extract
 * @return {Array}
 */
function extractFromEntity(entity, entityPath) {
    const entities = makeArray(entity); // Make sure it is iterable
    const levels = entityPath.split('.'); // Split the path on '.'
    const target = levels.shift();
    return entities.flatMap((ent) => {
        if (!hasProp(ent, target)) return null; // If no relevant property return null
        return (levels.length !== 0) // Recurse down, until end of path has been reached
            ? extractEntity(ent[target], levels.join('.'))
            : ent[target];
    }).filter((ent) => ent !== null);
}

/**
 * Returns a single identifierValue for the requested source
 * @param identifier {Array.<Object>} - An array of OMC identifiers
 * @param scope {string} - The source for which you wish the identifiers
 * @return {string} - A single identifier value
 */
function identifierOfScope (identifier, scope) {
    return identifier.filter((id) => id.identifierScope === scope)
        .map((id) => id.identifierValue)[0]
}

module.exports = {
    extractFromEntity,
    identifierOfScope,
}
