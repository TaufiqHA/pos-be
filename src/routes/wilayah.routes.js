const express = require('express');
const router = express.Router();
const { getWilayahs, createWilayah } = require('../controllers/wilayah.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);
router.get('/', getWilayahs);
router.post('/', createWilayah);

module.exports = router;
