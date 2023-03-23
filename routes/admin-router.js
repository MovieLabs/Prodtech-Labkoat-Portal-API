const express = require('express');

const jwtValidator = require('../util/JwtValidator')

const { admin: adminRouter } = require('../controllers/admin/authorize');
const { updatePolicy } = require('../controllers/admin/policy');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: process.env.JWKS_URI,
    audience: process.env.AUDIENCE,
    issuer: process.env.ISSUER,
})

router.get('/policy', checkJwt, adminRouter, async (req, res) => {
    console.log('GET: /adminRouter/policy');
    res.status = 200;
    res.json({
        secretMessage: 'Policy updated',
    });
});

router.post('/policy', checkJwt, adminRouter, async (req, res, next) => {
    console.log('POST: /adminRouter/policy');
    const { body } = req;
    try {
        const policy = await updatePolicy(body); // The policy to update
        console.log(`Result of policy update: ${policy}`);
        res.send('Updated the adminRouter');
    } catch (err) {
        res.status(500)
            .send(err);
    }
});

module.exports = router;
