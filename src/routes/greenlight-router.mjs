import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import { reshootController } from '../controllers/greenlight/greenlight-controller.mjs';

const router = express.Router();

router.get('/reshoot', reshootController);

export default router;
