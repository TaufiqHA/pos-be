const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting.controller');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', settingController.getSettings);
router.put('/:key', authMiddleware, settingController.updateSetting);

module.exports = router;
