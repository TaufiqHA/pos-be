const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.post('/login', login);
router.get('/me', requireAuth, getMe);

module.exports = router;
