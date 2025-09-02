import express from 'express';
import awsJwtVerifier from '../helpers/awsJwtVerifier.mjs';

import reshootController from '../controllers/greenlight/greenlight-controller.mjs';

const router = express.Router();

router.post('/reshoot', awsJwtVerifier, reshootController);

export default router;
