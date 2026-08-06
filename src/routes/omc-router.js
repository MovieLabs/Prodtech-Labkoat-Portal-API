import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import {
    proxyController,
    graphqlController,
    entityTypeController,
} from '../controllers/omc/omc-controller.js';

const router = express.Router();

router.get('/entity', awsJwtValidator, entityTypeController);
router.post('/entityType/:entity', awsJwtValidator, entityTypeController);
router.get('/identifier', awsJwtValidator, proxyController);
router.post('/identifier', proxyController);
router.post('/update', awsJwtValidator, proxyController); // Merge into what fMam holds
router.put('/update', awsJwtValidator, proxyController); // The payload IS the entity; replace it
router.delete('/update', awsJwtValidator, proxyController);
router.delete('/edge', awsJwtValidator, proxyController);
router.post('/graphql', awsJwtValidator, graphqlController);

export default router;
