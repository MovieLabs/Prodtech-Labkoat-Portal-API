const express = require('express');
const neo4j = require('neo4j-driver');

const jwtValidator = require('../helpers/JwtValidator');
const config = require('../config');

const {
    skosGet,
    skosPost,
} = require('../controllers/vocabulary/skosController');
const vocabNeo4J = require('../neo4J/vocabNeo4J');
const neoCache = require('../neo4J/neoCache');
const skosCache = require('../neo4J/skosCache');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

let neo4JInterface = null; // Neo4J interface and database connection
let dbDatabase = null;

async function vocabSetup(secrets) {
    const { LABKOAT } = secrets;
    const {
        NEO4J_PASSWORD,
    } = LABKOAT;
    const dbUri = config.AWS_NEO4J_URI;
    const dbUser = config.AWS_NEO4J_USERNAME;
    const dbPassword = NEO4J_PASSWORD;
    dbDatabase = config.AWS_NEO4J_DATABASE;
    // dbDatabase = 'omc-vocab';

    neo4JInterface = await vocabNeo4J({ // Initialize the Neo4J interface
        dbUri,
        dbUser,
        dbPassword,
        dbDatabase,
    });

    try {
        // Load up the Skos graph into the cache
        await neo4JInterface.query('getHierarchy'); // Top concepts and narrower
        await neo4JInterface.query('getScheme'); // Setup the cache
        await neo4JInterface.query('getConcept');
        await neo4JInterface.query('getLabel');
        skosCache.setCache(); // Setup the server side cache for the front (uses the cached raw neo4J responses)

        return true;
    } catch (err) {
        console.log(err);
        console.log(`Connection error\n${err}\nCause: ${err.cause}`);
        return false; // ToDo: Handle this with an error.
    }
}

router.get('/skos', checkJwt, ((req, res) => skosGet(req, res, neo4JInterface)));
router.post('/skos', checkJwt, ((req, res) => skosPost(req, res, neo4JInterface)));

module.exports = {
    vocabSetup,
    vocabRouter: router,
};
