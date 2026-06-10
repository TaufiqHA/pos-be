const express = require('express');
const router = express.Router();
const { getDeliveries, updateDelivery } = require('../controllers/delivery.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

router.get('/', getDeliveries);
router.put('/:id', updateDelivery);

module.exports = router;
