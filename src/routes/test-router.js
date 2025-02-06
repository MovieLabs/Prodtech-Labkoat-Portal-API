const express = require('express');

const serviceTokenController = require('../controllers/token-exchange/serviceTokenController');
const exchangeTokenController = require('../controllers/token-exchange/exchangeTokenController');

const router = express.Router();

router.get('/service', serviceTokenController);
router.get('/exchange', exchangeTokenController);

module.exports = router;
