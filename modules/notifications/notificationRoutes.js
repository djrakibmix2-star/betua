const express = require('express');
const router = express.Router();
const notificationController = require('./notificationController');

// আপনার authMiddleware থেকে verifyToken এবং isAdmin (বা আপনার দেওয়া নাম) ইমপোর্ট করুন
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware'); // পাথটা আপনার প্রজেক্ট অনুযায়ী ঠিক করে নেবেন

// সবার কাছে নোটিফিকেশন পাঠানোর রাউটে মিডলওয়্যারগুলো বসিয়ে দিন
router.post('/send-all', verifyToken, isAdmin, notificationController.sendToAll);

module.exports = router;