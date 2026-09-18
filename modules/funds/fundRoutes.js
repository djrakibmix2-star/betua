const express = require('express');
const router = express.Router();
const fundController = require('./fundController');
const { verifyToken } = require('../../middlewares/authMiddleware');

// ১. মাস্টার সামারি
router.get('/dashboard-summary', verifyToken, fundController.getDashboardSummary);

// ২. ট্র্যাশ বক্সের লেনদেন দেখার রুট (শুধু অ্যাডমিন/সাব-অ্যাডমিন)
router.get('/transactions/trash/list', verifyToken, fundController.getTrashTransactions);

// ৩. ট্রানজেকশন তালিকা (টোকেন সহ)
router.get('/transactions/all', verifyToken, fundController.getAllTransactions);
router.get('/pledges/all', verifyToken, fundController.getAllPledges);
router.get('/transactions/:fundType', verifyToken, fundController.getTransactionsByFund);
router.get('/pledges/:fundType', verifyToken, fundController.getPledgesByFund);

// ৪. পোস্ট, পুট ও ডিলিট
router.post('/transactions', verifyToken, fundController.createTransaction);
router.post('/pledges', verifyToken, fundController.createPledge);
router.post('/pledges/:id/approve', verifyToken, fundController.approvePledge);
router.post('/pledges/:id/cancel', verifyToken, fundController.cancelPledge);
router.put('/transactions/:id', verifyToken, fundController.updateTransaction);

// ৫. ট্র্যাশ থেকে রিস্টোর রুট
router.put('/transactions/trash/restore/:id', verifyToken, fundController.restoreTransaction);

// ৬. ডিলিট রুট (সফট ডিলিট অথবা পার্মানেন্ট ডিলিট)
router.delete('/transactions/:id', verifyToken, fundController.deleteTransaction);
router.delete('/pledges/:id', verifyToken, fundController.deletePledge);

module.exports = router;