const express = require('express');
const neo4j = require('neo4j-driver');

const jwtValidator = require('../helpers/JwtValidator');
const config = require('../config');

const {
    skosGet,
    skosPost,
} = require('../controllers/vocabulary/skosController');
const vocabNeo4J = require('../neo4J/vocabNeo4J');
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

    neo4JInterface = await vocabNeo4J({ // Initialize the Neo4J interface
        dbUri,
        dbUser,
        dbPassword,
        dbDatabase,
    });

    const vocabLoaded = await skosCache.loadCache(neo4JInterface);
    return vocabLoaded;
}

router.get('/skos', checkJwt, ((req, res) => skosGet(req, res, neo4JInterface)));
router.post('/skos', checkJwt, ((req, res) => skosPost(req, res, neo4JInterface)));

module.exports = {
    vocabSetup,
    vocabRouter: router,
};
