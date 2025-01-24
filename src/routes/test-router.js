const express = require('express');

const serviceTokenController = require('../controllers/test/serviceTokenController');
const exchangeTokenController = require('../controllers/test/exchangeTokenController');

const router = express.Router();

router.get('/service', serviceTokenController);
router.get('/exchange', exchangeTokenController);

module.exports = router;
