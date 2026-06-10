const express = require('express');
const router = express.Router();
const { getStockHistory } = require('../controllers/stockHistory.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

router.get('/', getStockHistory);

module.exports = router;
