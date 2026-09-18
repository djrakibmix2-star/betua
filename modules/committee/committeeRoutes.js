const express = require('express');
const router = express.Router();
const committeeController = require('./committeeController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const { checkFeaturePermission } = require('../../middlewares/permissionMiddleware');

// ১. কমিটি তালিকা দেখা (লগইন করা যেকোনো সদস্য দেখতে পারবে)
router.get('/', verifyToken, committeeController.getAllCommitteeMembers);

// ২. ট্র্যাশ বক্সের কমিটি সদস্য তালিকা দেখার রুট (শুধুমাত্র অ্যাডমিন)
router.get('/trash/list', verifyToken, committeeController.getTrashCommitteeMembers);

// ৩. ট্র্যাশ থেকে কমিটি সদস্য রিস্টোর (Restore) করার রুট
router.put('/trash/restore/:id', verifyToken, committeeController.restoreCommitteeMember);

// ৪. ফ্যামিলি লুকআপ রুট
router.get('/family-lookup/:code', committeeController.lookupFamilyByCode);

// ৫. নতুন কমিটি সদস্য যোগ করা (can_create পারমিশন চেক)
router.post(
    '/',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_create'),
    committeeController.createCommitteeMember
);

// ৬. কমিটি সদস্যের তথ্য আপডেট করা (can_edit পারমিশন চেক)
router.put(
    '/:id',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_edit'),
    committeeController.updateCommitteeMember
);

// ৭. কমিটি সদস্য মুছে ফেলা (can_delete পারমিশন চেক)
router.delete(
    '/:id',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_delete'),
    committeeController.deleteCommitteeMember
);

module.exports = router;