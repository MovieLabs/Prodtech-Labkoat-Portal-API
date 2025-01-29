import crypto from 'node:crypto';

/**
 * @typedef {object} omcIdentifier
 * @property {string} identifierScope - The scope of the identifier
 * @property {string} identifierValue - The value of the identifier
 *
 * @typedef {object} omcEntity
 * @property {string} schemaVersion - The version of the schema used to encode this instance
 * @property {omcIdentifier[]} omcIdentifier - An array of identifiers
 * @property {string} entityType - The type of entity
 */

/**
 * Hash an identifier object
 * @param identifier {omcIdentifier}
 * @returns {string}
 */

const hashedIdentifier = (identifier) => {
    const idString = `${identifier.identifierScope}:${identifier.identifierValue}`;
    return crypto.createHash('md5')
        .update(idString)
        .digest('hex');
};

/**
 * Retrieve the mapping of this identifier to other identifiers
 * @param db
 * @param identifier {omcIdentifier}
 * @returns {Promise<{omcIdentifier} | [{omcIdentifier}]>}
 */

async function retrieveMap(db, identifier) {
    const idHash = hashedIdentifier(identifier);
    const res = await db.collection('identifier').findOne({ _id: idHash });
    return res ? res.identifier : [];
}

export {
    hashedIdentifier,
    retrieveMap,
};
