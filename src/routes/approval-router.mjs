import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import { yamduController } from '../controllers/approval/yamduController.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

// router.get('/yamdu', checkJwt, yamduController);
router.get('/yamdu', yamduController);

export default router;
