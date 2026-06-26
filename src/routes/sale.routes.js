const express = require('express');
const router = express.Router();
const { getSales, createSale, paySale, deleteSale } = require('../controllers/sale.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

router.get('/', getSales);
router.post('/', createSale);
router.post('/:id/pay', paySale);
router.delete('/:id', deleteSale);

module.exports = router;
