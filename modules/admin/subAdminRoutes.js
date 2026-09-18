const express = require('express');
const router = express.Router();
const subAdminController = require('./subAdminController'); 
const { verifyToken } = require('../../middlewares/authMiddleware');

// সবকটি রাউটে verifyToken মিডলওয়্যার যুক্ত করা হলো
router.get('/all', verifyToken, subAdminController.getAllSubAdmins);                   // সকল সাব-এডমিন লিস্ট
router.post('/create', verifyToken, subAdminController.createSubAdmin);               // নতুন সাব-এডমিন তৈরি
router.put('/update/:id', verifyToken, subAdminController.updateSubAdmin);            // সাব-এডমিন এডিট
router.delete('/delete/:id', verifyToken, subAdminController.deleteSubAdmin);         // সাব-এডমিন ডিলিট

module.exports = router;