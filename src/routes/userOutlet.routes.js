const express = require('express');
const router = express.Router();
const userOutletController = require('../controllers/userOutlet.controller');

// CRUD endpoints for User Outlet
router.get('/', userOutletController.getAllUserOutlets);
router.get('/:id', userOutletController.getUserOutletById);
router.post('/', userOutletController.createUserOutlet);
router.put('/:id', userOutletController.updateUserOutlet);
router.delete('/:id', userOutletController.deleteUserOutlet);

module.exports = router;
