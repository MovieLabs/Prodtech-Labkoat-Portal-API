import express from 'express';
import awsJwtVerifier from '../helpers/awsJwtVerifier.js';

import reshootController from '../controllers/greenlight/greenlight-controller.js';

const router = express.Router();

router.post('/reshoot', awsJwtVerifier, reshootController);

export default router;
