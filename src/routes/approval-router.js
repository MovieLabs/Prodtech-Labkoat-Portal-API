import express from 'express';
import jwtValidator from '../helpers/JwtValidator.js';

import config from '../../config.js';

import { yamduController } from '../controllers/approval/yamduController.js';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

// router.get('/yamdu', checkJwt, yamduController);
router.get('/yamdu', yamduController);

export default router;
