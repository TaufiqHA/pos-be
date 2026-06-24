const express = require('express');
const router = express.Router();
const { getWilayahs, createWilayah, updateWilayah, deleteWilayah } = require('../controllers/wilayah.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);
router.get('/', getWilayahs);
router.post('/', createWilayah);
router.put('/:id', updateWilayah);
router.delete('/:id', deleteWilayah);

module.exports = router;
