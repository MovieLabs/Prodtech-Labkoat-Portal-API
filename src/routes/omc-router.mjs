import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import entityController from '../controllers/omc/omcController.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/entity', checkJwt, ((req, res) => entityController(req, res)));

export {
    router as omcRouter,
};
