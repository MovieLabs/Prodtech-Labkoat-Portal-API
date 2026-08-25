const express = require('express');

const exchangeTokenController = require('../controllers/token-exchange/exchangeTokenController');
const serviceTokenController = require('../controllers/token-exchange/serviceTokenController');

const router = express.Router();

router.get('/service', serviceTokenController);
router.get('/exchange', exchangeTokenController);

module.exports = router;
