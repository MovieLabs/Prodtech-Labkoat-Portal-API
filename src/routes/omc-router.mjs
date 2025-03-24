import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import {
    proxyController,
    entityTypeController,
} from '../controllers/omc/omc-controller.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

// router.get('/entity', checkJwt, ((req, res) => entityController(req, res)));
// router.post('/update', checkJwt, updateController);
router.get('/entity', entityTypeController);
router.post('/entityType/:entity', entityTypeController);
router.get('/identifier', proxyController);
router.post('/identifier', proxyController);
router.post('/update', proxyController);
router.delete('/update', proxyController);

export default router;
