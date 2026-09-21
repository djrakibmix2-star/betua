const express = require('express');
const router = express.Router();
const updateController = require('./updateController');

// যখন কেউ /check এ কল করবে, তখন কন্ট্রোলারের checkUpdate ফাংশনটি রান হবে
router.get('/check', updateController.checkUpdate);

module.exports = router;