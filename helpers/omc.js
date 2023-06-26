/**
 * Methods to manipulate or parse OMC entities
 * @module
 */

const { makeArray, hasProp } = require('./util');

/**
 * Return the functional and structural type of an entity
 */

const functionalType = ((ent) => ent?.functionalCharacteristics?.functionalType);

const structuralType = ((ent) => ent?.structuralCharacteristics?.structuralType);

const functionalProperties = ((ent) => ent?.functionalCharacteristics?.functionalProperties);

const structuralProperties = ((ent) => ent?.structuralCharacteristics?.structuralProperties);

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
            ? extractFromEntity(ent[target], levels.join('.'))
            : ent[target];
    }).filter((ent) => ent !== null);
}

/**
 * Returns a single identifierValue for the requested source
 * @param identifier {Array.<Object>} - An array of OMC identifiers
 * @param scope {string} - The source for which you wish the identifiers
 * @return {string} - A single identifier value
 */
function identifierOfScope(identifier, scope) {
    return identifier.filter((id) => id.identifierScope === scope)
        .map((id) => id.identifierValue)[0];
}

/**
 * Asset security could be based on the essence identifier, or for asset groups the main identifier
 * This method will return the appropriate one based on whether this is an Asset Group
 * @param assetOmc {object}
 * @param scope {string}
 */

function securityIdentifier(assetOmc, scope) {
    if (hasProp(assetOmc.AssetSC, 'structuralProperties')
        && assetOmc.AssetSC.structuralProperties !== null
        && (
            hasProp(assetOmc.AssetSC.structuralProperties, 'assetGroup')
            && assetOmc.AssetSC.structuralProperties.assetGroup !== null
        )
        && hasProp(assetOmc, 'Asset') && assetOmc.Asset !== null
    ) {
        console.log('Asset Group');
        return identifierOfScope(assetOmc, scope);
    } if (hasProp(assetOmc.AssetSC, 'identifier')) {
        return identifierOfScope(assetOmc.AssetSC.identifier, scope);
    }
    return null;
}

module.exports = {
    functionalType,
    structuralType,
    functionalProperties,
    structuralProperties,
    extractFromEntity,
    identifierOfScope,
    securityIdentifier,
};
