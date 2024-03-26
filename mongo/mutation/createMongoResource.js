/**
 * Create a new resource with the user data passed in
 */

const hash = require('object-hash');
const { DateTime } = require('luxon');

const { entityExists } = require('../mongo-operations');
const schema = require('../mongo-schema');
const generateId = require('../../../../helpers/generateID');

const idScope = 'labkoat';

function createIndex() {
    const {
        entityType, version, createdOn, payload, payloadHash, identifier,
    } = this;

    // If there is an identifier with the primary scope already use it, if not generate and add one
    const hasIdScope = identifier.filter((id) => id.identifierScope === idScope);
    const id = hasIdScope.length ? hasIdScope[0].identifierValue : generateId.entity('ent');

    const versionId = `${id}-${version.toString()}`; // Add the version number for the entity id
    const index = {
        _id: id,
        entityType,
        version,
        versionId, // The entity will use this id based on version
        updatedOn: createdOn,
        payloadHash,
        history: [{ versionId, createdOn }],
        Provenance: {
            createdOn,
            identifier: {
                identifierScope: idScope,
                identifierValue: 'user',
            },
        },
    };

    index.identifier = identifier; // Add the external id to the index
    if (hasIdScope.length === 0) { // If a new id was generated, add this
        index.identifier.push({
            identifierScope: idScope,
            identifierValue: id,
        });
    }

    const entity = {
        _id: versionId,
        primaryId: id,
        createdOn,
        payload: { ...payload },
        payloadHash,
    };

    entity.payload.identifier = index.identifier; // Same identifiers as the index, so that the payload aligns

    this.index = { ...this.index, ...index }; // Update the index and entity
    this.entity = { ...this.entity, ...entity };
    this.action = 'create'; // Create a new index and entity
}

function updateIndex() {
    const { createdOn, payload, payloadHash } = this;
    const index = { ...this.currentIndex }; // The current index from the database

    // Check to see if the payload hashes have changed
    // if (index.payloadHash === payloadHash) {
    //     this.action = 'ignore'; // If not safe to ignore this update
    // } else {
    const id = index._id; // The primary id

    index.version += 1; // Increase the version number
    const versionId = `${id}-${index.version.toString()}`;
    index.versionId = versionId; // New entity Id
    index.payloadHash = payloadHash;
    index.history.push({ versionId, createdOn }); // Save the current entity Id out to the history

    // Set up the new entity
    this.index = { ...index }; // Update the index and entity
    this.entity = {
        _id: versionId,
        primaryId: id,
        createdOn,
        payload: { ...payload },
        payloadHash,
    };
    this.action = 'update'; // Create a new index and entity
    // }
}

/*
Validate the user data and return the resource
 */

// Extract the identifier with the primary scope of the system
const primaryScope = ((identifier) => identifier.filter((id) => id.identifierScope === idScope));

async function setupResource(db, entity) {
    // Setup a new containing object for the resource
    const r = Object.create({ createIndex, updateIndex });
    const container = Object.assign(r, schema(), {
        payload: entity,
        identifier: primaryScope(entity.identifier),
        entityType: entity.entityType,
    });

    // Add the current index to the container, if there is one
    container.currentIndex = await entityExists(db, entity.identifier);

    const dt = DateTime.local(); // ToDo This should be GMT when pushed
    container.createdOn = dt.toString();
    container.payloadHash = hash.MD5(container.payload); // Generate hash of payload to manage updates
    [container.status.identifier] = primaryScope(entity.identifier);
    return container;
}

/**
 * Create a new entity as a resource in a Mongo data store
 * @param db {object} A Mongo database connection
 * @param entity {object} An OMC-JSON entity
 * @return {Promise<{resource}>}
 */

async function createMongoResource(db, entity) {
    const resource = await setupResource(db, entity); // Set up the container

    // Throw an error if someone is trying to create an entity where the id already exists
    if (resource.currentIndex !== null) {
        resource.action = 'error';
        resource.status = { // Update the status
            ...resource.status,
            ...{
                level: 0,
                description: 'error',
                message: 'Cannot create new entity, entity with this id exists',
            },
        };
    } else {
        resource.createIndex(); // Create an index for the new resource
    }
    return resource;
}

/**
 Update the Mongo resources associated with an entity, increasing the version number
 @param db {object} A Mongo database connection
 @param entity {object} An OMC-JSON entity
 @return {Promise<{resource}>}
 */

async function updateMongoResource(db, entity) {
    const resource = await setupResource(db, entity); // Set up the container
    // Throw an error if someone is trying to create an entity where the id already exists
    if (resource.currentIndex === null) {
        resource.action = 'error';
        resource.status = { // Update the status
            ...resource.status,
            ...{
                level: 0,
                description: 'error',
                message: 'Cannot update, entity with this id does not exist',
            },
        };
    } else {
        resource.updateIndex(); // Create an index for the new resource
    }
    return resource;
}

/**
 Delete all resources associated with an entity, this will include the index and all prior versions
 @param db {object} A Mongo database connection
 @param entity {object} An OMC-JSON entity
 @return {Promise<{resource}>}
 */

async function deleteMongoResource(db, entity) {
    const resource = await setupResource(db, entity); // Set up the container

    // Throw an error if someone is trying to delete an entity that does not exist
    if (resource.currentIndex === null) {
        resource.action = 'error';
        resource.status = {
            ...resource.status,
            ...{
                level: 0,
                description: 'error',
                message: 'Cannot delete, this entity does not exist',
            },
        };
    } else {
        resource.action = 'delete';
    }
    return resource;
}

module.exports = {
    create: createMongoResource,
    update: updateMongoResource,
    delete: deleteMongoResource,
};
