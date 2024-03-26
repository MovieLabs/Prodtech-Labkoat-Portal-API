/**
 * Returns a container object used for managing entities being processed before being written
 * into Mongo, includes the schemas used for storing the indexes and entities in the Mongo collections.
 *
 * @module
 */

function entitySchema() {
    return {
        currentIndex: null, // If the entity already exists, this is the current index object
        createdOn: null, // An ISO 8601 UTC timestamp
        action: null,
        log: null, // Field for passing to logging system
        error: null, // Any applicable error message
        status: { // Report status including errors
            identifier: null, // Entity being described
            level: null, // Logging level (0 - error, 1 - warn, 2 - info ...)
            description: null, // Description of error
            message: null, // Message for console or user response
        },
        versionId: null, // The current Id for the entity, includes a version
        entityType: null, // The named class of the entity (passed in by the user)
        version: 1, // The starting version number when created
        identifier: null, // An identifier from the external system (passed in by the user)
        payload: null, // The payload of the entity (passed in by the user).
        payloadHash: null, // A hash of the payload for testing if data had changed and needs updating
        related: {}, // Sets of related entities
        index: {
            _id: null,
            entityType: null,
            schemaVersion: '1.0.0',
            version: null,
            versionId: null,
            updatedOn: null,
            payloadHash: null,
            identifier: [],
            history: [],
            Provenance: {
                createdOn: null,
                createdBy: {
                    identifier: {
                        identifierScope: null,
                        identifierValue: null,
                    },
                },
            },
        },
        entity: {
            _id: null, // Unique id for this version of the entity
            primaryId: null, // The primary Id, used by the index and absent the version suffix
            createdOn: null, // Date this version was created
            createdBy: { // Who was this version created by
                identifier: {
                    identifierScope: null,
                    identifierValue: null,
                },
            },
            schemaVersion: '1.0.0',
            payloadHash: null,
            payload: null,
        },
    };
}

module.exports = entitySchema;
