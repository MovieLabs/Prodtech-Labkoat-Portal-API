import express from 'express';

import awsJwtVerifier from '../helpers/awsJwtVerifier.mjs';

import {
    proxyController,
    graphqlController,
    entityTypeController,
} from '../controllers/omc/omc-controller.mjs';

const router = express.Router();

router.get('/entity', entityTypeController);
router.post('/entityType/:entity', entityTypeController);
router.get('/identifier', awsJwtVerifier, proxyController);
// router.get('/identifier', proxyController);
router.post('/identifier', proxyController);
router.post('/update', proxyController);
router.delete('/update', proxyController);
router.post('/graphql',awsJwtVerifier, graphqlController);

export default router;
