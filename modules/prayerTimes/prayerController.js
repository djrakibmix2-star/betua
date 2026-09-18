const db = require('../../config/db');

// ১. নামাজের সব ওয়াক্তের সময়সূচি আনা (পাবলিক - সবাই দেখতে পাবে)
exports.getAllPrayerTimes = async (req, res) => {
    try {
        const query = `
            SELECT 
                id, 
                waqt_name, 
                azan_time, 
                iqamah_time,
                TIME_FORMAT(azan_time, '%h:%i %p') AS azan_time_display, 
                TIME_FORMAT(iqamah_time, '%h:%i %p') AS iqamah_time_display, 
                updated_at
            FROM prayer_times
            ORDER BY FIELD(waqt_name, 'FAJR', 'DHUHR', 'ASR', 'MAGHRIB', 'ISHA', 'JUMMAH')
        `;
        const [times] = await db.query(query);

        res.json({
            success: true,
            message: 'আলহামদুলিল্লাহ! নামাজের সময়সূচি হাজির করা হলো।',
            prayerTimes: times
        });
    } catch (error) {
        console.error("Prayer times error:", error);
        res.status(500).json({
            success: false,
            message: 'ইন্নালিল্লাহ! ওয়াক্তের সময়সূচি আনতে বিপত্তি ঘটেছে: ' + error.message
        });
    }
};

// ২. নির্দিষ্ট ওয়াক্তের সময় আপডেট করা (পারমিশন প্রটেক্টেড)
exports.updatePrayerTime = async (req, res) => {
    const { waqt_name, azan_time, iqamah_time } = req.body;

    if (!waqt_name || !azan_time || !iqamah_time) {
        return res.status(400).json({
            success: false,
            message: 'ওয়াক্তের নাম, আজানের সময় এবং ইক্বামাতের সময়—সবগুলোই পূরণ করতে হবে।'
        });
    }

    try {
        const query = `
            UPDATE prayer_times 
            SET azan_time = ?, iqamah_time = ?, updated_by = ?
            WHERE waqt_name = ?
        `;
        const [result] = await db.query(query, [azan_time, iqamah_time, req.user?.id || null, waqt_name]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'ওয়াক্তের নাম সঠিক নয় অথবা কোনো রেকর্ড পাওয়া যায়নি।'
            });
        }

        res.json({
            success: true,
            message: `আলহামদুলিল্লাহ! ${waqt_name} ওয়াক্তের আজান ও জামাতের সময় সফলভাবে হালনাগাদ করা হয়েছে।`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'সময় আপডেট করতে সমস্যা হয়েছে: ' + error.message
        });
    }
};