import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import directoryController from '../controllers/directory/directory.mjs';
import securityController from '../controllers/directory/securityController.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/directory', checkJwt, directoryController);
router.get('/directory/security', checkJwt, securityController);

export default router;
