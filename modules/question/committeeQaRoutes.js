const express = require('express');
const router = express.Router();
const committeeQaController = require('./committeeQaController'); // একই ফোল্ডারের ভেতর থাকায় শুধু নাম দিলেই হবে
const { verifyToken } = require('../../middlewares/authMiddleware'); // আপনার ফোল্ডার স্ট্রাকচার অনুযায়ী পাথ ঠিক করা আছে

// ১. সকল কমিটির মূল প্রশ্নের তালিকা দেখার রুট
router.get('/', verifyToken, committeeQaController.getAllCommitteeQuestions);
router.get('/list', verifyToken, committeeQaController.getAllCommitteeQuestions);

// ২. নির্দিষ্ট কমিটির প্রশ্নের ভেতরের সম্পূর্ণ কনভারসেশন বা চ্যাট থ্রেড দেখার রুট
router.get('/:id', verifyToken, committeeQaController.getCommitteeQuestionThread);
router.get('/thread/:id', verifyToken, committeeQaController.getCommitteeQuestionThread);

// ৩. নতুন প্রশ্ন করা অথবা বিদ্যমান থ্রেডে রিপ্লাই/পাল্টা প্রশ্ন দেওয়ার রুট
router.post('/', verifyToken, committeeQaController.addCommitteeReplyOrQuestion);
router.post('/reply', verifyToken, committeeQaController.addCommitteeReplyOrQuestion);

// ৪. প্রশ্ন ও সম্পূর্ণ থ্রেড ডিলিট করার রুট (অ্যাডমিন বা সাব-এডমিন)
router.delete('/:id', verifyToken, committeeQaController.deleteCommitteeQuestionThread);

module.exports = router;