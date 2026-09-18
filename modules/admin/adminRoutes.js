const express = require('express');
const router = express.Router();
const adminController = require('./adminController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const profileController = require('../profile/profileController'); // আগের প্রোফাইল কন্ট্রোলার

// অ্যাডমিন চেক মিডলওয়্যার (ADMIN এবং SUPERADMIN উভয়কেই সাপোর্ট করবে)
const requireAdmin = (req, res, next) => {
    const role = (req.user?.role || req.user?.base_role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'SUPERADMIN') {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: "অননুমোদিত অ্যাক্সেস! শুধুমাত্র অ্যাডমিন এটি করতে পারবেন।"
    });
};

// ১. ইউজারের নিজের সব ফিচারের পারমিশন পাওয়ার রুট
router.get('/my-permissions', verifyToken, adminController.getMyAllPermissions);

// ২. অ্যাক্টিভ সদস্যদের তালিকা
router.get('/all-active-users', verifyToken, adminController.getActiveUsers);
router.get('/users', verifyToken, adminController.getActiveUsers);

// ৩. সরাসরি নতুন সদস্য তৈরি
router.post('/users/create', verifyToken, adminController.createDirectUser);
router.post('/users/create-direct', verifyToken, adminController.createDirectUser);

// ৪. ইউজারের পারমিশন দেখা ও সেভ করা
router.get('/users/:userId/permissions', verifyToken, adminController.getUserPermissions);
router.put('/users/:userId/permissions', verifyToken, adminController.saveUserPermissions);
router.post('/users/:userId/permissions', verifyToken, adminController.saveUserPermissions);

// ৫. পেন্ডিং তালিকা দেখার রাউট (profileController এর মাধ্যমে যাতে আগের ও পরের সব মেম্বার ডাটা আসে)
router.get('/pending-users', verifyToken, requireAdmin, profileController.getAllPendingRequests);
router.get('/requests/pending', verifyToken, requireAdmin, profileController.getAllPendingRequests);

// ৬. এপ্রুভালের রাউটসমূহ (পরিবর্তन করে profileController.approveRequest দেওয়া হলো, যা প্রোফাইল এডিট এবং নতুন ইউজার দুটোই অটো এপ্রুভ করবে)
router.post('/requests/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);
router.put('/requests/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);

router.post('/pending-users/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);
router.put('/pending-users/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);

router.post('/users/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);
router.put('/users/:requestId/approve', verifyToken, requireAdmin, profileController.approveRequest);

// ৭. রিজেক্টের রাউটসমূহ 
router.post('/requests/:requestId/reject', verifyToken, requireAdmin, profileController.rejectRequest);
router.put('/requests/:requestId/reject', verifyToken, requireAdmin, profileController.rejectRequest);

router.post('/pending-users/:requestId/reject', verifyToken, requireAdmin, profileController.rejectRequest);
router.put('/pending-users/:requestId/reject', verifyToken, requireAdmin, profileController.rejectRequest);

module.exports = router;