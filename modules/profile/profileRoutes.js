const express = require('express');
const router = express.Router();
const profileController = require('./profileController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const multer = require('multer');

// ছবি রিসিভ করার জন্য Multer কনফিগারেশন (মেমোরিতে সেভ করবে)
const upload = multer({ storage: multer.memoryStorage() });

// অ্যাডমিন চেক মিডলওয়্যার
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

// ইউজার ও অ্যাডমিন উভয়ের প্রোফাইল, পাসওয়ার্ড ও ছবি আপলোড রাউট
router.get('/me', verifyToken, profileController.getMyProfile);
router.post('/request-edit', verifyToken, profileController.requestProfileEdit);
router.post('/change-password', verifyToken, profileController.changePassword);
// ছবি আপলোডের রাউট
router.post('/upload-avatar', verifyToken, upload.single('avatar'), profileController.uploadAvatar);

// অ্যাডমিনের পেন্ডিং আবেদন ও অনুমোদন রাউট
router.get('/admin/requests', verifyToken, requireAdmin, profileController.getAllPendingRequests);
router.post('/admin/requests/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);
router.post('/admin/requests/:requestId/reject', verifyToken, requireAdmin, profileController.rejectRequest);

module.exports = router;