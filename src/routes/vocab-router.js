import express from 'express';
import config from '../../config.js';

import {
    skosGet,
    skosPost,
    skosDownload,
} from '../controllers/vocabulary/skosController.js';
import {
    omcGet,
    omcPost,
} from '../controllers/vocabulary/omcController.js';
import neo4jInterface from '../neo4J/neo4JInterface.js';
import awsJwtVerifier from '../helpers/awsJwtVerifier.js';
import skosCache from '../neo4J/skosCache.js';
import omcCache from '../neo4J/omcCache.js';

const router = express.Router();

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

router.get('/skos', awsJwtVerifier, ((req, res) => skosGet(req, res, neo4Jdb)));
router.get('/skos/json', ((req, res) => skosDownload(req, res, 'json')));
router.get('/skos/ttl', ((req, res) => skosDownload(req, res, 'ttl')));
router.post('/skos', awsJwtVerifier, ((req, res) => skosPost(req, res, neo4Jdb)));
router.get('/omc', awsJwtVerifier, ((req, res) => omcGet(req, res, neo4Jdb)));
router.post('/omc', awsJwtVerifier, ((req, res) => omcPost(req, res, neo4Jdb)));

export {
    vocabSetup,
    router as vocabRouter,
};
