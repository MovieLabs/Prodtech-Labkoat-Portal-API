import express from 'express';
import jwtValidator from '../helpers/JwtValidator.js';

import config from '../../config.js';

import directoryController from '../controllers/directory/directory.js';
import securityController from '../controllers/directory/securityController.js';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/directory', checkJwt, directoryController);
router.get('/directory/security', checkJwt, securityController);

export default router;
