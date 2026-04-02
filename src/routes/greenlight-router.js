import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import reshootController from '../controllers/greenlight/greenlight-controller.js';

const router = express.Router();

router.post('/reshoot', awsJwtValidator, reshootController);

export default router;
