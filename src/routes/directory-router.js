const express = require('express');
const jwtValidator = require('../helpers/JwtValidator');

const config = require('../../config');

const directoryController = require('../controllers/directory/directory');
const securityController = require('../controllers/directory/securityController');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/directory', checkJwt, directoryController);
router.get('/directory/security', checkJwt, securityController);

module.exports = router;
