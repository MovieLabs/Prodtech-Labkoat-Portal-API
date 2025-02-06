import express from 'express';

import jwtValidator from '../helpers/JwtValidator.mjs';
import config from '../../config.mjs';

import {
    skosGet,
    skosPost,
    skosDownload,
} from '../controllers/vocabulary/skosController.mjs';
import {
    omcGet,
    omcPost,
} from '../controllers/vocabulary/omcController.mjs';
import neo4jInterface from '../neo4J/neo4JInterface.mjs';
import skosCache from '../neo4J/skosCache.mjs';
import omcCache from '../neo4J/omcCache.mjs';
// const createJsonLd = require('../vocabulary/jsonld');
// const createTtl = require('../vocabulary/ttl');

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

    // Temporary token-exchange code for creation of JSON-LD
    // const skosVocab = skosCache.getCache();
    // createJsonLd(skosVocab);
    // createTtl(skosVocab);

    return vocabLoaded;
}

router.get('/skos', checkJwt, ((req, res) => skosGet(req, res, neo4Jdb)));
router.get('/skos/json', ((req, res) => skosDownload(req, res, 'json')));
router.get('/skos/ttl', ((req, res) => skosDownload(req, res, 'ttl')));
router.post('/skos', checkJwt, ((req, res) => skosPost(req, res, neo4Jdb)));
router.get('/omc', checkJwt, ((req, res) => omcGet(req, res, neo4Jdb)));
router.post('/omc', checkJwt, ((req, res) => omcPost(req, res, neo4Jdb)));

export {
    vocabSetup,
    router as vocabRouter,
};
