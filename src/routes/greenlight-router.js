import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import { greenlightPingController } from '../controllers/greenlight/greenlight-controller.js';

const router = express.Router();

router.post('/ping', awsJwtValidator, greenlightPingController);

export default router;
