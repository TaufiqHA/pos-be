const express = require('express');
const router = express.Router();
const { getPurchases, createPurchase, payPurchase, processPurchase, cancelPurchase, updatePurchase } = require('../controllers/purchase.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

router.get('/', getPurchases);
router.post('/', createPurchase);
router.post('/:id/pay', payPurchase);
router.post('/:id/process', processPurchase);
router.post('/:id/cancel', cancelPurchase);
router.put('/:id', updatePurchase);

module.exports = router;
