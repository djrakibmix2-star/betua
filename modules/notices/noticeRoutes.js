const express = require('express');
const router = express.Router();
const noticeController = require('./noticeController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const { checkFeaturePermission } = require('../../middlewares/permissionMiddleware');

// ১. তালিকা পড়া (লগইন করা মেম্বার)
router.get('/', verifyToken, noticeController.getAllNotices);

// ২. ট্র্যাশ বা ডিলিট বক্সের নোটিশ তালিকা দেখার রুট (শুধু অ্যাডমিন/সাব-অ্যাডমিন)
router.get('/trash', verifyToken, noticeController.getTrashNotices);

// ৩. নতুন নোটিশ তৈরি
router.post(
    '/',
    verifyToken,
    checkFeaturePermission('notices', 'can_create'),
    noticeController.createNotice
);

// ৪. নোটিশ আপডেট (id এবং noticeId দুটো প্যারামিটার প্যাটার্নই সাপোর্ট করবে)
router.put(
    '/:id',
    verifyToken,
    checkFeaturePermission('notices', 'can_edit'),
    noticeController.updateNotice
);

// ৫. ট্র্যাশ থেকে নোটিশ রিস্টোর (Restore) করা
router.put(
    '/trash/restore/:id',
    verifyToken,
    noticeController.restoreNotice
);

// ৬. নোটিশ ডিলিট (সফট ডিলিট অথবা পার্মানেন্ট ডিলিট)
router.delete(
    '/:id',
    verifyToken,
    checkFeaturePermission('notices', 'can_delete'),
    noticeController.deleteNotice
);

module.exports = router;