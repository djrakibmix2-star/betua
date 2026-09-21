const express = require('express');
const router = express.Router();
const committeeController = require('./committeeController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const { checkFeaturePermission } = require('../../middlewares/permissionMiddleware');

// ১. কমিটি তালিকা দেখা
router.get('/', verifyToken, committeeController.getAllCommitteeMembers);

// ২. ট্র্যাশ বক্সের কমিটি সদস্য তালিকা (অ্যান্ড্রয়েডের সাথে মিল রেখে /trash করা হলো)
router.get('/trash', verifyToken, committeeController.getTrashCommitteeMembers);

// ৩. ট্র্যাশ থেকে রিস্টোর করার রুট (অ্যান্ড্রয়েডের POST /:id/restore এর সাথে মিল রেখে)
router.post(
    '/:id/restore',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_delete'),
    committeeController.restoreCommitteeMember
);

// ৪. ফ্যামিলি লুকআপ রুট
router.get('/family-lookup/:code', verifyToken, committeeController.lookupFamilyByCode);

// ৫. নতুন কমিটি সদস্য যোগ করা
router.post(
    '/',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_create'),
    committeeController.createCommitteeMember
);

// ৬. কমিটি সদস্যের তথ্য আপডেট করা
router.put(
    '/:id',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_edit'),
    committeeController.updateCommitteeMember
);

// ৭. কমিটি সদস্য মুছে ফেলা (Soft & Permanent Delete)
router.delete(
    '/:id',
    verifyToken,
    checkFeaturePermission('COMMITTEE', 'can_delete'),
    committeeController.deleteCommitteeMember
);

module.exports = router;