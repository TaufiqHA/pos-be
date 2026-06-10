const express = require('express');
const router = express.Router();
const { getProducts, createProduct, updateProduct, deleteProduct, adjustStock } = require('../controllers/product.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

router.get('/', getProducts);
router.post('/', createProduct);
router.post('/adjust-stock', adjustStock);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
