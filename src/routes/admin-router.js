const express = require('express');

const jwtValidator = require('../helpers/JwtValidator.mjs');

const { admin } = require('../controllers/admin/authorize');
const { updatePolicy } = require('../controllers/admin/policy');
const { taskList, taskExecute } = require('../controllers/admin/task');
const { isAdministrator } = require('../controllers/auth0Interface');

const router = express.Router();

const config = require('../../config.mjs');

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/check', checkJwt, admin, async (req, res) => {
    console.log('GET: api/admin/check');
    const { auth } = req;
    const user = `${auth.uid}`;
    // const isAdmin = await isAdministrator(user);
    const isAdmin = true;
    res.status = 200;
    res.json({
        isAdministrator: isAdmin,
    });
});

router.get('/policy', checkJwt, updatePolicy, async (req, res) => {
    console.log('GET: api/admin/policy');
    res.status = 200;
    res.json({
        secretMessage: 'Policy updated',
    });
});

router.post('/policy', checkJwt, updatePolicy, async (req, res) => {
    console.log('POST: api/admin/policy');
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

router.get('/task', checkJwt, async (req, res, next) => {
    console.log('GET: api/admin/task');
    const taskResponse = await taskList(req, res, next);
    res.json(taskResponse);
});
router.post('/task', checkJwt, async (req, res, next) => {
    console.log('POST: api/admin/task');
    const taskResponse = await taskExecute(req, res, next);
    res.send('Executed some task');
});

module.exports = router;
