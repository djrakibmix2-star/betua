const express = require('express');
const router = express.Router();
const authController = require('./authController');
const { verifyToken } = require('../../middlewares/authMiddleware');

// উন্মুক্ত অথেনটিকেশন রাউট
router.post('/register', authController.register);
router.post('/login', authController.login);

// ফ্যামিলি কোড দিয়ে সদস্যদের লিস্ট আনা (রেজিস্ট্রেশনের সময় উন্মুক্ত থাকবে)
router.post('/family-members-by-code', authController.getFamilyMembersByCode);

// ফ্যামিলি মেম্বার নিজের নামে অ্যাকাউন্ট ক্লেইম করা (উন্মুক্ত থাকবে)
router.post('/claim-sub-profile', authController.claimSubProfile);

// নির্বাচনের জন্য সদস্য খোঁজার নতুন রাউট (১০০ প্রিফিক্স লজিকসহ)
router.post('/election-member-by-code', authController.getElectionMemberByCode);

// প্রোফাইল ও সেটিংস রাউট (টোকেন সিকিউরড)
router.get('/profile', verifyToken, authController.getProfile); // <-- এই রাউটটি যুক্ত করা হলো
router.put('/profile/update', verifyToken, authController.updateProfile);
router.post('/profile/change-password', verifyToken, authController.changePassword);
router.post('/profile/request-family-member', verifyToken, authController.requestFamilyMember);

module.exports = router;