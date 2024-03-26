/**
 * Methods that manipulate the OMC-JSON for the graphQl input types or output types and map
 * that to the schema used for storing this data in the Mongo instance.
 */

const graphqlFields = require('graphql-fields');

const logger = require('../../../logging/logger'); // Log
const { hasProp } = require('../../../helpers/util');
const mongoEntity = require('./query/mongo-entity');
const mongoResource = require('./mutation/createMongoResource');
const { createMongoEntity, updateMongoEntity, deleteMongoEntity } = require('./mongo-operations');

/**
 * Return the parameters in the selection set, excluding the entityType and identifier
 * When additional parameters are present, then the entity should be de-referenced
 * @param info {Object} - The info object from the graphql resolver
 * @returns {Array[String]} - Any additional query parameters in the selection set beyond entityType and identifier
 */

const dereferenceParameters = (info) => Object.keys(graphqlFields(info, {}, {
    processArguments: true,
    excludedFields: ['entityType', 'identifier'],
}));

/**
 * Where one entity references another entity, based on the Selection Set this will
 * either return the reference in the current query or return all of the referenced entities themselves
 *
 * @type {(function(*, *, *, *): Promise<*|Awaited<Object|null>[]>)|*}
 */
const resolveReference = async (obj, db, info, entityType) => {
    if (!hasProp(obj, entityType)) return null; // This does not have field for requested entityType
    const selectionSet = dereferenceParameters(info);
    console.log(`Resolve: ${entityType}`);
    // All the reasons if no selections, no valid identifier or no entity to query
    const inRequest = selectionSet.filter((f) => hasProp(obj[entityType], f));
    if (inRequest.length === selectionSet.length) {
        return obj[entityType];
    }
    if (!selectionSet.length || !hasProp(obj, entityType) || !obj[entityType]) return obj[entityType];

    // If only reference a single entity, then query and return just that entity
    if (!Array.isArray(obj[entityType])) {
        return obj[entityType].identifier.length // If no identifier, then no need to run query
            ? mongoEntity.byIdentifier(db, obj[entityType].identifier)
            : obj[entityType];
    }
    console.log(`Do query: ${entityType}`);
    // Otherwise, resolve a set of referenced entities
    const ids = obj[entityType].map((id) => id.identifier).flat();
    const loadEntities = ids.map((id) => mongoEntity.byIdentifier(db, id));
    return Promise.all(loadEntities);
};

/**
 * Resolve a single entity
 */

const resolveEntity = async (obj, db) => {
    if (obj === undefined) return null;
    try {
        const ent = obj.identifier.length // If no identifier, then no need to run query
            ? mongoEntity.byIdentifier(db, obj.identifier)
            : obj;
        const t = await ent;
        return t;
    } catch (err) {
        console.log(err);
        return null;
    }
};

/**
 * Create a new entity
 */

const createEntity = async (obj, db, info, entityType) => {
    const entity = { ...obj, ...{ entityType } };
    const resource = await mongoResource.create(db, entity);
    if (resource.action === 'create') {
        const status = await createMongoEntity(db, resource);
        logger(status);
        return entity;
    }
    if (resource.action === 'error') {
        logger(resource.status);
        throw new Error(resource.status.message);
    }
    throw new Error('An error occurred');
};

const updateEntity = async (obj, db, info, entityType) => {
    const entity = { ...obj, ...{ entityType } };
    const resource = await mongoResource.update(db, entity);
    if (resource.action === 'update') {
        const status = await updateMongoEntity(db, resource);
        logger(status);
        return entity;
    }
    if (resource.action === 'error') {
        logger(resource.status);
        throw new Error(resource.status.message);
    }
    throw new Error('An error occurred');
};

const deleteEntity = async (obj, db, info, entityType) => {
    const entity = { ...obj, ...{ entityType } };
    const resource = await mongoResource.delete(db, entity);

    if (resource.action === 'delete') {
        const status = await deleteMongoEntity(db, resource);
        logger(status);
        return null;
    }
    if (resource.action === 'error') {
        logger(resource.status);
        throw new Error(resource.status.message);
    }
    throw new Error('An error occurred');
};

module.exports = {
    dereferenceParameters,
    resolveReference,
    resolveEntity,
    createEntity,
    updateEntity,
    deleteEntity,
};
