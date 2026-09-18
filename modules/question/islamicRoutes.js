const express = require('express');
const router = express.Router();
const islamicController = require('./islamicController');
const { verifyToken } = require('../../middlewares/authMiddleware'); // পাথ আপনার ফোল্ডার স্ট্রাকচার অনুযায়ী সেট করবেন

// ১. সকল মূল প্রশ্নের তালিকা দেখার রুট
router.get('/', verifyToken, islamicController.getAllQuestions);
router.get('/list', verifyToken, islamicController.getAllQuestions);

// ২. নির্দিষ্ট প্রশ্নের ভেতরের সম্পূর্ণ কনভারসেশন বা চ্যাট থ্রেড দেখার রুট
router.get('/:id', verifyToken, islamicController.getQuestionThread);
router.get('/thread/:id', verifyToken, islamicController.getQuestionThread);

// ৩. নতুন প্রশ্ন করা অথবা বিদ্যমান থ্রেডে রিপ্লাই/পাল্টা প্রশ্ন দেওয়ার রুট
router.post('/', verifyToken, islamicController.addReplyOrQuestion);
router.post('/reply', verifyToken, islamicController.addReplyOrQuestion);

// ৪. প্রশ্ন ও সম্পূর্ণ থ্রেড ডিলিট করার রুট (অ্যাডমিন বা সাব-এডমিন)
router.delete('/:id', verifyToken, islamicController.deleteQuestionThread);

module.exports = router;