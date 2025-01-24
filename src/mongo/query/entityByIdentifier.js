const { hashedIdentifier, retrieveMap } = require('./mongo-utils');

/**
 * Retrieve an entity using its identifier
 * @param db
 * @param identifier {{identifierValue: *, identifierScope: *}}
 * @returns {Promise<{omcEntity}>}
 */

async function entityByIdentifier(db, identifier) {
    const idMap = await retrieveMap(db, identifier);
    const primaryId = Array.isArray(idMap)
        ? identifier
        : idMap;
    const primaryIdHash = hashedIdentifier(primaryId);
    const entity = await db.collection('omc').findOne({ _id: primaryIdHash });
    return entity.payload;
}

module.exports = {
    entityByIdentifier,
};
