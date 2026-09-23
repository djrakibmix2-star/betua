const express = require('express');
const router = express.Router();
const notificationController = require('./notificationController');

// সবার কাছে নোটিফিকেশন পাঠানোর রাউট
router.post('/send-all', notificationController.sendToAll);

module.exports = router;