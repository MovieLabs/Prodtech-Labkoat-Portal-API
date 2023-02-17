const express = require('express');
const jwtValidator = require('../util/JwtValidator');

const directoryController = require('../controllers/okta/directory');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: process.env.JWKS_URI,
    audience: process.env.AUDIENCE,
    issuer: process.env.ISSUER,
})

router.get('/directory', checkJwt, directoryController);

module.exports = router;
