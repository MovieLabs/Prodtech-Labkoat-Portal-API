const express = require('express');
const jwtValidator = require('../helpers/JwtValidator');

const config = require('../config');

const assetController = require('../controllers/asset/assetController');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/info', checkJwt, assetController.info);

module.exports = router;
