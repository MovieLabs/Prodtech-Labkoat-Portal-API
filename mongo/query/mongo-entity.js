/**
 * Find an entity based on it's Identifier
 */

// const createContext = require('../../../../mongo/query/createContext');
const { makeArray, hasProp } = require('../../helpers/util');

const labkoatId = ((identifier) => identifier.find((id) => id.identifierScope === 'labkoat'));

/**
 * Add the Context to the given entity for the Context that currently part of the entity
 *
 * @param cxt {object} - The entity to which context should be added
 * @param edges {array} - An array of edges for the entity
 */

function createContext(cxt, edges) {
    if (cxt === null) return null;
    const Context = { ...cxt };
    if (edges === null) return Context || null; // Safety checks
    const cxtFor = {
        identifierScope: 'labkoat',
        identifierValue: edges[0].object,
    };
    Context.For = [{
        identifier: [cxtFor],
    }];
    if (!hasProp(Context, 'contextType')) Context.contextType = 'general';
    edges.forEach(({ predicate, subjectType, subject }) => {
        Context[predicate] = Context[predicate] || {}; // Initialize the Context
        Context[predicate][subjectType] = Context[predicate][subjectType] || [];
        Context[predicate][subjectType].push({
            identifier: [{
                identifierScope: 'labkoat',
                identifierValue: subject,
            }],
        });
    });
    console.log(Context);
    return Context;
}

/**
 * Query for the edges associated with a specific identifierValue
 * @param db {Object} - The mongo database connection
 * @param identifierValue {string} - The identifierValue in the labkoat domain
 * @return {Promise<Object|null>}
 */

async function getEdges(db, identifierValue) {
    console.log(`Mongo - getEdges: ${identifierValue}`);

    const query = { object: identifierValue };
    const cursor = db.collection('edges').find(query);
    const docs = await cursor.toArray();
    return docs.length ? docs : null; // Safety check if nothing in db
}

/**
 * Return an entity matching a specific identifier
 *
 * @param db {Object} - The mongo database connection
 * @param identifier {Object} - An identifier
 * @return {Promise<Object|null>}
 */

async function byIdentifier(db, identifier) {
    if (Array.isArray(identifier) && identifier.length !== 1) {
        console.log('Warning there are multiples identifiers to look up');
    }

    const primaryId = Array.isArray(identifier) ? identifier[0] : identifier;
    const { identifierScope, identifierValue } = primaryId;
    console.log(`Mongo - entity.byIdentifier: ${identifierScope} - ${identifierValue}`);

    // Setup the aggregation query for the entity
    const agg = [
        {
            $match: {
                'identifier.identifierScope': identifierScope,
                'identifier.identifierValue': identifierValue,
            },
        }, {
            $lookup: {
                from: 'entity',
                localField: 'versionId',
                foreignField: '_id',
                as: 'entity',
            },
        },
    ];
    const entityCursor = db.collection('index').aggregate(agg);

    try {
        const docs = await entityCursor.toArray(); // Request the entity

        return docs.length === 0
            ? null // Safety check if nothing in db
            : docs[0].entity[0].payload; // Extract only the entity itself
    } catch (err) {
        console.log(err);
        return null;
    }
}

/**
 * Return all entities of a specific type
 *
 * @param db {Object} - The mongo database connection
 * @param entityType {String} - The name of the entity
 * @return {Promise<[Object]>||null} - All the entities of the requested type
 */
async function byEntityType(db, entityType) {
    const query = entityType || '';

    // Setup the aggregation query
    const agg = [
        {
            $match: {
                entityType: query,
            },
        }, {
            $lookup: {
                from: 'entity',
                localField: 'versionId',
                foreignField: '_id',
                as: 'entity',
            },
        },
    ];
    const entityCursor = db.collection('index').aggregate(agg);
    const docs = await entityCursor.toArray();
    return docs.length === 0
        ? null // Safety check if nothing in db
        : docs.map((doc) => ({ ...doc.entity[0].payload }));
}

/**
 * Return all entities of a specific type
 *
 * @param db {Object} - The mongo database connection
 * @param entityType {String} - The name of the entity
 * @return {Promise<[Object]>||null} - All the entities of the requested type
 */
async function searchEntity(db, entityType, search) {
    const query = entityType || '';

    const { field, value } = search;
    // Set up the aggregation query
    const agg = [
        {
            $match: {
                entityType: query,
            },
        }, {
            $lookup: {
                from: 'entity',
                localField: 'versionId',
                foreignField: '_id',
                as: 'entity',
            },
        },
        {
            $match: {
                [`entity.payload.${field}`]: value,
            },
        },
    ];
    const entityCursor = db.collection('index').aggregate(agg);

    const docs = await entityCursor.toArray();

    return docs.length === 0
        ? null // Safety check if nothing in db
        : docs.map((doc) => ({ ...doc.entity[0].payload }));
}

/**
 * Find an entity based on it's Identifier
 */

async function byAttribute(db, query) {
    console.log('Mongo - getByAttribute');
    console.log(query);
    const cursor = db.collection('entity').find(query);
    const docs = await cursor.toArray(); // Responses to the query, includes all version

    // Using the primary Id, lookup the index and use the current versionId to filter the results
    // ToDo This code only deals with on response to any query, should add option for multiple responses
    const primaryId = [...new Set(docs.map((ent) => ent.primaryId))];
    return byIdentifier(db, { identifierScope: 'labkoat', identifierValue: primaryId[0] });
    // const index = await db.collection('index').findOne({ _id: primaryId[0] });
    // const currentVersion = docs.filter((ent) => ent._id === index.versionId);
    // return currentVersion[0].payload; // Extract only the entity itself
}

/**
 * Create a Context dynamically by retrieving the available relationships for this entity
 * @param ent
 * @param db
 * @return {Promise<*>}
 */
async function dynamicContext(ent, db) {
    const cxtPromise = ent.Context.map(async (cxt) => byIdentifier(db, cxt.identifier));
    return Promise.all(cxtPromise);
}

module.exports = {
    byIdentifier,
    byEntityType,
    searchEntity,
    byAttribute,
    dynamicContext,
};
