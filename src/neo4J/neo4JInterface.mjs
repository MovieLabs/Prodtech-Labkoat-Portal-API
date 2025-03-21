/**
 * Set of methods for interacting with the Vocabulary database on Neo4J
 */

import neo4j from 'neo4j-driver';

import {
    makeArray,
    hasProp,
} from '../helpers/util.mjs';

// import {
//     nodes as batchNodes,
//     edges as batchEdges,
// } from './neo4jUpdate.mjs';

// Run the fetch against the database
async function fetchNeo4J(cypher, db, dbDatabase) {
    const params = {};
    try {
        const node = await db.executeQuery(
            cypher,
            params,
            {
                database: dbDatabase,
                bookmarkManager: null,
            },
        );
        return node;
    } catch (err) {
        console.log('Error: Entity did not resolve');
        console.log(err);
        return null;
    }
}

/**
 * Create a connector to a Neo4J database
 *
 * @param {string} dbUri - URI of the database to connect to
 * @param {string} dbUser - Username credentials
 * @param {string} dbPassword - Password credentials
 * @return {Promise<Driver|boolean>}
 */

async function initDriver(dbUri, dbUser, dbPassword) {
    const options = {
        logging: {
            level: 'debug',
            logger: (level, message) => {
                console[level].call(console, `${level.toUpperCase()} ${message}`);
            },
        },
    };

    try {
        const driver = neo4j.driver(
            dbUri,
            neo4j.auth.basic(dbUser, dbPassword),
            // options,
        );
        const serverInfo = await driver.getServerInfo();
        console.log('Connection established');
        console.log(serverInfo);
        return driver;
    } catch (err) {
        console.log(`Connection error\n${err}\nCause: ${err.cause}`);
        return false; // ToDo: Handle this with an error.
    }
}

/**
 * Reset the database, remove all existing nodes and edges ensure all indexes are created
 *
 * @return {Promise<Awaited<{node: *}|{error: *}|undefined>[]>}
 */

async function neo4jReset() {
    const {
        driver,
        dbDatabase,
    } = this;

    const resetCypher = [
        'MATCH (n) DETACH DELETE n',
        'CREATE CONSTRAINT idUnique IF NOT EXISTS FOR (ent:SKOS) REQUIRE ent.id IS UNIQUE',
    ];

    const resetWrites = resetCypher.map((cypher) => (
        driver.executeQuery(
            cypher,
            {}, // No parameters
            {
                dbDatabase,
                bookmarkManager: null,
            },
        )));
    return Promise.all(resetWrites);
}

/**
 * Write vocabulary nodes to a Neo4J database, including all edges from Contexts and intrinsic properties
 *
 * @param {OMC-JSON} omcVocab - The OMC-JSON to be written
 * @return {Promise<{nodes: Awaited<unknown>[], context: Promise<Awaited<{node: *}|{error: *}|undefined>[]>}|boolean>}
 */
async function write(omcVocab) {
    if (omcVocab === undefined || omcVocab === null) return false;

    const {
        driver,
        dbDatabase,
    } = this;

    const {
        nodes,
        edges,
    } = omcVocab;
    const nodeRes = await batchNodes(nodes, driver, dbDatabase);
    const edgeRes = await batchEdges(edges, driver, dbDatabase);

    return {
        nodes: nodeRes,
        edges: edgeRes,
    };
}

/**
 * Execute a query to the Neo4J database and cache the result in the internal cache
 * @type {{getScheme: string, getLabel: string, getConcept: string}}
 */

const neoQueries = {
    getScheme: `MATCH(scheme:ConceptScheme)-[lblRel:prefLabel]->(label)
OPTIONAL MATCH(concept:Concept)-[rel:inScheme]->(scheme)
RETURN scheme, lblRel, label, concept, rel`,
    getConcept: `MATCH(concept:Concept)-[rel:narrower|broader]->(:Concept)
RETURN concept, rel`,
    getLabel: `MATCH(concept:Concept)-[lbl:prefLabel|altLabel]->(label:Label)
RETURN concept, label, lbl`,
    getSkosRoot: `MATCH (root:SKOS:Root{id:"skos-Root"})-[e:hasScheme]-(scheme)
return root, e, scheme`,
    getTopConceptOf: `MATCH (a:Concept)-[e:topConceptOf]-(b:ConceptScheme)
RETURN e`,
    getHierarchy: `MATCH (scheme:ConceptScheme)-[tcEdge:hasTopConcept]-(concept:Concept)
OPTIONAL MATCH (concept)-[nEdge:narrower *1..2]-(nConcept:Concept)
RETURN scheme, concept, nConcept, tcEdge, nEdge`,
    getOmcRoot: `MATCH (n:Root)
OPTIONAL MATCH (n)-[e1:hasProperty]-(d1)
OPTIONAL MATCH (n)-[e2:propertyOf]-(d2)
RETURN n, e1, e2`,
    getOmcClass: `MATCH (n:Class)
OPTIONAL MATCH (n)-[e1:hasSkosDefinition]-(d1)
OPTIONAL MATCH (n)-[e2:representedBy]-(d5)
RETURN n, e1, e2`,
    getOmcEntity: `MATCH (n:Entity)
OPTIONAL MATCH (n)-[e1:hasSkosDefinition]-(d1)
OPTIONAL MATCH (n)-[e2:hasProperty]-(d2)
OPTIONAL MATCH (n)-[e3:propertyOf]-(d3)
OPTIONAL MATCH (n)-[e4:hasControlledValue]-(d4)
OPTIONAL MATCH (n)-[e5:represents]-(d5)
RETURN n, e1, e2, e3, e4, e5`,
    getOmcProperty: `MATCH (n:Property)
OPTIONAL MATCH (n)-[e1:hasSkosDefinition]-(d1)
OPTIONAL MATCH (n)-[e2:hasProperty]-(d2)
OPTIONAL MATCH (n)-[e3:propertyOf]-(d3)
OPTIONAL MATCH (n)-[e4:hasControlledValue]-(d4)
OPTIONAL MATCH (n)-[e5:hasSubValue]-(d5)
OPTIONAL MATCH (n)-[e6:represents]-(d6)
RETURN n, e1, e2, e3, e4, e5, e6`,
    getOmcControlledValue: `MATCH (n:ControlledValue)
OPTIONAL MATCH (n)-[e1:hasSkosDefinition]-(d1)
OPTIONAL MATCH (n)-[e2:controlledValueFor]-(d2)
OPTIONAL MATCH (n)-[e3:hasSubValue]-(d3)
OPTIONAL MATCH (n)-[e4:subValueFor]-(d4)
RETURN n, e1, e2, e3, e4`,
    getOmcRepresent: `MATCH(node) WHERE node:Property OR node:Entity
OPTIONAL MATCH (node)-[edge1:represents]-(class:Class)-[edge2:representedBy]-(node)
RETURN node, class, edge1, edge2`,
    getOmcRelations: `OPTIONAL MATCH (:Entity)-[edge1:hasProperty]-(:Property)-[edge2:propertyOf]-(:Entity)
OPTIONAL MATCH (:Entity)-[edge7:hasProperty]-(:Entity)-[edge8:propertyOf]-(:Entity)
OPTIONAL MATCH (:Property)-[edge3:hasProperty]-(:Property)-[edge4:propertyOf]-(:Property)
OPTIONAL MATCH (:Root)-[edge5:hasProperty]-(:Entity)-[edge6:propertyOf]-(:Root)
RETURN edge1, edge2, edge3, edge4, edge5, edge6, edge7, edge8`,
    getOmcSkos: 'MATCH (x)-[e:hasSkosDefinition]-(y) RETURN e',
    getOmcSchema: `MATCH(s:Schema)
OPTIONAL MATCH(s)-[e1:schemaChild]-(s1)
OPTIONAL MATCH(s)-[e2:hasValue]-(v1)
return s, e1, e2`,
    getOmcContainer: `MATCH(s:Container)
OPTIONAL MATCH(s)-[e1:hasProperty]-(s1)
return s, e1`,
};

async function query(queryName) {
    const {
        driver,
        dbDatabase,
    } = this;

    if (!hasProp(neoQueries, queryName)) {
        console.log('Request to Neo4J database failed, no such query name');
        return null;
    }
    const cypher = neoQueries[queryName];
    return fetchNeo4J(cypher, driver, dbDatabase);
}

function writeBatch(batchQuery) {
    const {
        driver,
        dbDatabase,
    } = this;
    const batch = makeArray(batchQuery);
    const t = batch.map((q) => {
        if (Array.isArray(q) || !q.params.length) return null;
        return driver.executeQuery(
            q.cypher,
            { params: q.params },
            {
                database: dbDatabase,
                bookmarkManager: null,
            },
        );
    });
    return t;
}

/**
 *
 * @param {string} dbUri
 * @param {string} dbUser
 * @param {string} dbPassword
 * @param {string} dbDatabase
 * @return {Promise<{driver>}
 * @constructor
 */

async function VocabNeo4j({
    dbUri,
    dbUser,
    dbPassword,
    dbDatabase,
}) {
    const driver = await initDriver(dbUri, dbUser, dbPassword);

    return {
        write,
        writeBatch,
        query,
        driver,
        dbDatabase,
    };
}

export default VocabNeo4j;
