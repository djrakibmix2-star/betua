const express = require('express');
const router = express.Router();
const prayerController = require('./prayerController');
const { verifyToken } = require('../../middlewares/authMiddleware');
const { checkFeaturePermission } = require('../../middlewares/permissionMiddleware');

// নামাজের সময় দেখা (যে কেউ দেখতে পারে)
router.get('/', prayerController.getAllPrayerTimes);

// নামাজের সময় আপডেট (শুধুমাত্র অ্যাডমিন অথবা prayer_times পারমিশনপ্রাপ্ত ইউজার)
// PUT /api/prayer-times/:id
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { azan_time, iqamah_time } = req.body;

        await db.query(
            'UPDATE prayer_times SET azan_time = ?, iqamah_time = ? WHERE id = ?',
            [azan_time, iqamah_time, id]
        );

        res.json({
            success: true,
            message: 'নামাজের সময় সফলভাবে হালনাগাদ করা হয়েছে।'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি হয়েছে।' });
    }
});

module.exports = router;