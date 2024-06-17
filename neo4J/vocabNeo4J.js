/**
 * Set of methods for interacting with the Vocabulary database on Neo4J
 */

const neo4j = require('neo4j-driver');

const neoCache = require('./neoCache');
const {
    makeArray,
    hasProp,
} = require('../helpers/util');

const { writeNode } = require('./writeNodes');
const {
    nodes: batchNodes,
    edges: batchEdges,
    deleteEdges,
    deleteNodes,
    updateEdges,
    updateNodes,
} = require('./neo4jUpdate');

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

    const resetWrites = resetCypher.map((cypher) => writeNode({
        cypher,
        params: {},
    }, driver, dbDatabase));
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
    getScheme: `MATCH(concept:Concept)-[rel:inScheme]->(scheme:ConceptScheme)
RETURN concept, scheme, rel
    `,
    getConcept: `MATCH(concept:Concept)-[rel:narrower|broader]->(:Concept)
RETURN concept, rel`,
    getLabel: `MATCH(concept:Concept)-[lbl:prefLabel|altLabel]->(label:Label)
RETURN concept, label, lbl`,
    getHierarchy: `MATCH (scheme:ConceptScheme)-[tcEdge:hasTopConcept]-(concept:Concept)
OPTIONAL MATCH (concept)-[nEdge:narrower *1..2]-(nConcept:Concept)
RETURN scheme, concept, nConcept, tcEdge, nEdge`,
};

async function query(queryName) {
    const {
        driver,
        dbDatabase,
    } = this;
    if (!hasProp(neoQueries, queryName)) {
        console.log('Request to Neo4J database failed, no such query name');
        return;
    }
    const cypher = neoQueries[queryName];
    const schemeQuery = await fetchNeo4J(cypher, driver, dbDatabase);
    if (!schemeQuery) return;
    neoCache.add(schemeQuery);
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

module.exports = VocabNeo4j;
