const express = require('express');

const jwtValidator = require('../helpers/JwtValidator.mjs');

const { view, admin } = require('../controllers/admin/authorize');
const { serveImage } = require('../../serve-image');
const { updatePolicy } = require('../controllers/admin/policy');

const router = express.Router();

const config = require('../../config.mjs');

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/asset', checkJwt, view, async (req, res) => {
    console.log('GET: admin/asset');
    res.status = 200;
    res.json({
        secretMessage: 'The asset is all yours',
    });
});

router.post('/asset', checkJwt, view, (req, res) => {
    console.log('POST: admin/asset');
    const { body } = req;
    serveImage(req, res);
});

router.get('/image', checkJwt, view, async (req, res) => {
    console.log('admin/image');
    res.status = 200;
    res.json({
        secretMessage: 'The asset is all yours',
    });
});

router.get('/admin', checkJwt, admin, async (req, res) => {
    console.log('admin/admin');
    res.status = 200;
    res.json({
        secretMessage: 'Policy updated',
    });
});

router.post('/admin', checkJwt, admin, async (req, res) => {
    const { body } = req;
    try {
        const policy = await updatePolicy(body); // The policy to update
        console.log(`Result of policy update: ${policy}`);
        res.send('Updated the admin');
    } catch (err) {
        res.status(500)
            .send(err);
    }
});

module.exports = router;
