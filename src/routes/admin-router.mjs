import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import resetHpa from '../controllers/admin/resetHPA-controller.mjs';
import { updatedCharacter, updatedNarLocation } from '../controllers/admin/hpaTest.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/reset', checkJwt, resetHpa);
router.get('/testcharacter', updatedNarLocation);

export default router;
