const express = require('express');
const router = express.Router();
const { getSales, createSale, paySale } = require('../controllers/sale.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

router.get('/', getSales);
router.post('/', createSale);
router.post('/:id/pay', paySale);

module.exports = router;
