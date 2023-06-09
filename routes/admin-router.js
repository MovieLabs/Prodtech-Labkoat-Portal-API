const express = require('express');

const jwtValidator = require('../helpers/JwtValidator');

const { admin: adminRouter } = require('../controllers/admin/authorize');
const { updatePolicy } = require('../controllers/admin/policy');

const router = express.Router();

const config = require('../config');

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/policy', checkJwt, adminRouter, async (req, res) => {
    console.log('GET: /adminRouter/policy');
    res.status = 200;
    res.json({
        secretMessage: 'Policy updated',
    });
});

router.post('/policy', checkJwt, adminRouter, async (req, res) => {
    console.log('POST: /adminRouter/policy');
    const { body } = req;
    try {
        const policy = await updatePolicy(body); // The policy to update
        console.log(`Result of policy update: ${policy}`);
        res.send('Updated the adminRouter');
    } catch (err) {
        console.log(err);
        res.status(500)
            .send(err);
    }
});

module.exports = router;
