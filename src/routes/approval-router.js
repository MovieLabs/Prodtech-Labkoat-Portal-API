const express = require('express');
const jwtValidator = require('../helpers/JwtValidator');

const config = require('../../config');

const approvalController = require('../controllers/approval/approvalController');
const yamduController = require('../controllers/approval/yamduController');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/events', checkJwt, approvalController);
router.get('/yamdu', checkJwt, yamduController);

module.exports = router;
