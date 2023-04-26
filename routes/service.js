const express = require('express');
const jwtValidator = require('../util/JwtValidator');

const config = require('../config');

const serviceTokenController = require('../controllers/service/serviceTokenController');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/test', serviceTokenController);

module.exports = router;
