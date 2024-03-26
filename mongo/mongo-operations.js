/**
 * Methods that make direct calls to the Mongo database writing or reading documents
 */

const { MongoClient: MongoConnection } = require('mongodb');

const { makeArray } = require('../helpers/util');

/**
 * Check the Mongo database is healthy and up
 * @param mongoOptions {object}
 * @param mongoOptions.username {string} Username to authenticate onto the Mongo instance
 * @param mongoOptions.password {string} Password to authenticate onto the Mongo instance
 * @param mongoOptions.mongoUrl {string} URL of the Mongo instance
 */

async function connectionHealth({ username, password, mongoUrl }) {
    // eslint-disable-next-line no-template-curly-in-string
    const dbUrl = mongoUrl.replace('${username}', username).replace('${password}', password);

    try {
        const client = new MongoConnection(dbUrl, {});
        await client.connect();
        await client.close();
        return { message: 'ok' };
    } catch (err) {
        return { message: `Mongo db not ready: ${err}` };
    }
}

/**
 * Establish a connection to the mongo database
 * @param mongoOptions {object}
 * @param mongoOptions.username {string} Username to authenticate onto the Mongo instance
 * @param mongoOptions.password {string} Password to authenticate onto the Mongo instance
 * @param mongoOptions.mongoUrl {string} URL of the Mongo instance
 * @param mongoOptions.dbName {string} The name of the database to use
 */

async function connection({
    username, password, mongoUrl, dbName,
}) {
    // eslint-disable-next-line no-template-curly-in-string
    const dbUrl = mongoUrl.replace('${username}', username).replace('${password}', password);

    const client = new MongoConnection(dbUrl, {});
    await client.connect();
    return client.db(dbName);
}

// Update the status object with relevent information from operation
const updateStatus = ({ status }, level, description, message) => ({
    ...status,
    ...{ level, description, message },
});

/**
 * Check if entity already exists in the db
 * @param db
 * @param identifier
 * @return {Promise<*>}
 */

async function entityExists(db, identifier) {
    const id = makeArray(identifier);
    const ids = id.map((i) => ({
        'identifier.identifierScope': i.identifierScope,
        'identifier.identifierValue': i.identifierValue,
    }));
    return db.collection('index').findOne({ $or: ids });
}

/**
 * Add a new entity to the database
 */

async function createMongoEntity(db, resource) {
    const entityResponse = await db.collection('entity').insertOne(resource.entity); // Insert the entity
    const indexResponse = await db.collection('index').insertOne(resource.index); // Insert the indexes
    return (entityResponse.acknowledged && indexResponse.acknowledged)
        ? updateStatus(resource, 2, 'create', 'Created entity')
        : updateStatus(resource, 0, 'error', 'Mongo returned an error while creating');
}

/**
 * Update and existing entity (advancing the version number
 * @param db
 * @param resource
 * @return {Promise<{error: string}|null>}
 */

async function updateMongoEntity(db, resource) {
    const entityResponse = await db.collection('entity').insertOne(resource.entity); // Insert the entity
    const query = { _id: resource.index._id };
    const indexResponse = await db.collection('index').replaceOne(query, resource.index); // Insert the indexes
    return (entityResponse.acknowledged && indexResponse.acknowledged)
        ? updateStatus(resource, 2, 'update', 'Updated entity')
        : updateStatus(resource, 0, 'error', 'Mongo returned an error while updating');
}

async function deleteMongoEntity(db, resource) {
    const { history } = resource.currentIndex; // Set of prior versions that should also be deleted
    const allVersions = history.map((e) => e.versionId); // Array of entities to delete
    const entityResponse = await db.collection('entity').deleteMany({ _id: { $in: allVersions } });
    const indexResponse = await db.collection('index').deleteOne({ _id: resource.currentIndex._id });
    const { deletedCount } = entityResponse;
    return (entityResponse.acknowledged && indexResponse.acknowledged)
        ? updateStatus(resource, 2, 'delete', `Deleted ${deletedCount} entities`)
        : updateStatus(resource, 0, 'error', 'Mongo returned an error while deleting');
}

module.exports = {
    connectionHealth,
    connection,
    entityExists,
    createMongoEntity,
    updateMongoEntity,
    deleteMongoEntity,
};
