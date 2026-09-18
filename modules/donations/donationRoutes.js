const express = require('express');
const router = express.Router();
const donationController = require('./donationController');
const { verifyToken } = require('../../middlewares/authMiddleware');

// ১. অনুদান সাবমিট (উন্মুক্ত)
router.post('/submit', donationController.submitDonation);

// ২. নির্দিষ্ট ইউজারের হিস্ট্রি
router.get('/my/:phone', donationController.getMyDonations);

// ৩. পাবলিক অনুমোদিত তালিকা
router.get('/approved', donationController.getAllApprovedDonations);

// ৪. ক্যাশিয়ার/অ্যাডমিন ভেরিফিকেশন রাউটস
router.get('/pending', verifyToken, donationController.getPendingDonations);
router.post('/:id/approve', verifyToken, donationController.approveDonation);
router.post('/:id/reject', verifyToken, donationController.rejectDonation);

module.exports = router;