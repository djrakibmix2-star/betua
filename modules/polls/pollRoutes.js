const express = require('express');
const router = express.Router();
const pollController = require('./pollController');
const { verifyToken } = require('../../middlewares/authMiddleware');

// ১. পোলের তালিকা (লগইন থাকলে নিজের ভোটের স্ট্যাটাসসহ আসবে)
router.get('/', verifyToken, pollController.getAllPolls);

// ২. নতুন পোল তৈরি করা (এডমিন/অথোরাইজড)
router.post('/create', verifyToken, pollController.createPoll);

// ৩. পোল আপডেট বা সময় এক্সটেন্ড করা (নতুন যুক্ত করা হলো)
router.put('/:id', verifyToken, pollController.updatePoll);

// ৪. পরিবারের সদস্যদের ভোট জমা দেওয়া
router.post('/:id/vote', verifyToken, pollController.submitFamilyVotes);

// ৫. পোল সমাপ্ত ঘোষণা করা
router.post('/:id/close', verifyToken, pollController.closePoll);

// ৬. পোল ডিলিট করা
router.delete('/:id', verifyToken, pollController.deletePoll);

module.exports = router;