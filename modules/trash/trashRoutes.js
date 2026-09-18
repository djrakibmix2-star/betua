const express = require('express');
const router = express.Router();
const trashController = require('./trashController');
const { verifyToken } = require('../../middlewares/authMiddleware');

const requireAdmin = (req, res, next) => {
    const role = (req.user?.role || req.user?.base_role || '').toUpperCase();
    if (role === 'ADMIN') return next();
    return res.status(403).json({ success: false, message: 'শুধুমাত্র অ্যাডমিন ট্র্যাশ বক্স পরিচালনা করতে পারবেন।' });
};

// ১. ট্র্যাশ বক্সের সকল আইটেম (মেম্বার, ট্রানজেকশন, নোটিশ) একসাথে দেখার রুট
router.get('/', verifyToken, requireAdmin, trashController.getAllTrashItems);

// ২. ট্র্যাশ থেকে যেকোনো আইটেম রিস্টোর করার রুট
// উদাহরণ: PUT /api/trash/restore/member/5 অথবা /api/trash/restore/transaction/12
router.put('/restore/:type/:id', verifyToken, requireAdmin, trashController.restoreTrashItem);

// ৩. ট্র্যাশ থেকে যেকোনো আইটেম স্থায়ীভাবে মুছে ফেলার রুট
// উদাহরণ: DELETE /api/trash/permanent/notice/3
router.delete('/permanent/:type/:id', verifyToken, requireAdmin, trashController.permanentDeleteTrashItem);

module.exports = router;