const express = require('express');
const router = express.Router();
const memberController = require('./memberController');
const { verifyToken } = require('../../middlewares/authMiddleware');

// অ্যাডমিন বা সাব-অ্যাডমিন চেক মিডলওয়্যার
const requireAdminOrSubAdmin = (req, res, next) => {
    const role = (req.user?.role || req.user?.base_role || '').toUpperCase();
    if (['ADMIN', 'SUBADMIN'].includes(role) || req.user?.can_create === 1 || req.user?.can_edit === 1 || req.user?.can_delete === 1) {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: 'মাফ করবেন ভাই! এই কার্যক্রম পরিচালনার প্রয়োজনীয় এখতিয়ার আপনার নেই।'
    });
};

// ১. সদস্য তালিকা দেখা
router.get('/', verifyToken, memberController.getAllMembers);

// ২. ট্র্যাশ বক্সের সদস্য তালিকা দেখার রুট (অ্যাডমিন ও সাব-অ্যাডমিন)
router.get('/trash/list', verifyToken, requireAdminOrSubAdmin, memberController.getTrashMembers);

// ৩. ট্র্যাশ থেকে সদস্য রিস্টোর (Restore) করার রুট
router.put('/trash/restore/:id', verifyToken, requireAdminOrSubAdmin, memberController.restoreMember);

// ৪. সরাসরি নতুন সদস্য যুক্ত করার রুট (পাসওয়ার্ডসহ)
router.post('/admin-add', verifyToken, requireAdminOrSubAdmin, memberController.adminAddMember);

// ৫. নির্দিষ্ট সদস্যের বিস্তারিত দেখা
router.get('/:memberId', verifyToken, requireAdminOrSubAdmin, memberController.getMemberDetailsById);

// ৬. সদস্যের তথ্য এডিট করা
router.put('/:memberId', verifyToken, requireAdminOrSubAdmin, memberController.adminUpdateMember);

// ৭. সদস্য ডিলিট (সফট ডিলিট অথবা পার্মানেন্ট ডিলিট)
router.delete('/:memberId', verifyToken, requireAdminOrSubAdmin, memberController.deleteMemberPermanently);

// ৮. পারমিশন অ্যাসাইন ফাংশন
if (typeof memberController.assignPermission === 'function') {
    router.post('/assign-permission', verifyToken, requireAdminOrSubAdmin, memberController.assignPermission);
}

module.exports = router;