const express = require('express');
const neo4j = require('neo4j-driver');

const jwtValidator = require('../helpers/JwtValidator');
const config = require('../config');

const {
    skosGet,
    skosPost,
} = require('../controllers/vocabulary/skosController');
const {
    omcGet,
    omcPost,
} = require('../controllers/vocabulary/omcController');
const neo4jInterface = require('../neo4J/neo4JInterface');
const skosCache = require('../neo4J/skosCache');
const omcCache = require('../neo4J/omcCache');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

let neo4Jdb = null; // Neo4J interface and database connection
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

    neo4Jdb = await neo4jInterface({ // Initialize the Neo4J interface
        dbUri,
        dbUser,
        dbPassword,
        dbDatabase,
    });

    const vocabLoaded = await skosCache.loadCache(neo4Jdb);
    await omcCache.loadCache(neo4Jdb);
    return vocabLoaded;
}

router.get('/skos', checkJwt, ((req, res) => skosGet(req, res, neo4Jdb)));
router.post('/skos', checkJwt, ((req, res) => skosPost(req, res, neo4Jdb)));
router.get('/omc', checkJwt, ((req, res) => omcGet(req, res, neo4Jdb)));
router.post('/omc', checkJwt, ((req, res) => omcPost(req, res, neo4Jdb)));

module.exports = {
    vocabSetup,
    vocabRouter: router,
};
