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

router.get('/storyboard', checkJwt, assetController.storyboard);
router.get('/concept', checkJwt, assetController.concept);

module.exports = router;
