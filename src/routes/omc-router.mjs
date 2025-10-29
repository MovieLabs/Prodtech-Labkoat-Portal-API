import express from 'express';

import awsJwtVerifier from '../helpers/awsJwtVerifier.mjs';

import {
    proxyController,
    graphqlController,
    entityTypeController,
} from '../controllers/omc/omc-controller.mjs';

const router = express.Router();

router.get('/entity', awsJwtVerifier, entityTypeController);
router.post('/entityType/:entity', awsJwtVerifier, entityTypeController);
router.get('/identifier', awsJwtVerifier, proxyController);
router.post('/identifier', proxyController);
router.post('/update', awsJwtVerifier, proxyController);
router.delete('/update', awsJwtVerifier, proxyController);
router.post('/graphql',awsJwtVerifier, graphqlController);

export default router;
