const express = require('express');
const router = express.Router();
const constitutionController = require('./constitutionController');
const { verifyToken } = require('../../middlewares/authMiddleware');

// ১. নির্দিষ্ট সমাজের গঠনতন্ত্র দেখার রুট
router.get('/', verifyToken, constitutionController.getConstitution);

// ২. গঠনতন্ত্র আপলোড বা আপডেট করার রুট (মেইন অ্যাডমিনের জন্য)
router.post('/upload', verifyToken, constitutionController.uploadConstitution);

module.exports = router;