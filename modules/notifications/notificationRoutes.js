const express = require('express');
const router = express.Router();
const notificationController = require('./notificationController');

// শুধু verifyToken ইমপোর্ট করুন (isAdmin সম্ভবত ওই ফাইলে নেই)
const { verifyToken } = require('../../middlewares/authMiddleware');

// অ্যাডমিন চেক করার জন্য কাস্টম মিডলওয়্যার (ঠিক profileRoutes-এর মতো)
const requireAdmin = (req, res, next) => {
    const role = (req.user?.role || req.user?.base_role || '').toUpperCase();
    if (role === 'ADMIN') {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: "অননুমোদিত অ্যাক্সেস! শুধুমাত্র অ্যাডমিন এটি করতে পারবেন।"
    });
};

// সবার কাছে নোটিফিকেশন পাঠানোর রাউটে মিডলওয়্যারগুলো বসিয়ে দিন
router.post('/send-all', verifyToken, requireAdmin, notificationController.sendToAll);

module.exports = router;