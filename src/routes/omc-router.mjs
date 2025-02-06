import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import { entityController, updateController, removeController } from '../controllers/omc/omc-controller.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

// router.get('/entity', checkJwt, ((req, res) => entityController(req, res)));
// router.post('/update', checkJwt, updateController);
router.get('/entity', entityController);
router.post('/update', updateController);
router.delete('/update', removeController);

export {
    router as omcRouter,
};
