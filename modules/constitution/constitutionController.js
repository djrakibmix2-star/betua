const db = require('../../config/db'); // আপনার ডাটাবেস কানেকশন ফাইলের সঠিক পাথ

// ১. গঠনতন্ত্র ফেচ করা (ইউজারদের জন্য)
exports.getConstitution = async (req, res) => {
    try {
        // verifyToken থেকে প্রাপ্ত ইউজারের society_id
        const societyId = req.user?.society_id || req.user?.societyId;

        if (!societyId) {
            return res.status(400).json({
                success: false,
                message: 'সমাজ বা মসজিদের আইডি শনাক্ত করা যায়নি।'
            });
        }

        const [rows] = await db.query(
            `SELECT id, title, file_url, uploaded_at 
             FROM constitutions 
             WHERE society_id = ? 
             ORDER BY id DESC LIMIT 1`,
            [societyId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'এই মসজিদের জন্য এখনো কোনো গঠনতন্ত্র যুক্ত করা হয়নি।'
            });
        }

        res.json({
            success: true,
            constitution: rows[0]
        });
    } catch (err) {
        console.error("getConstitution Error:", err);
        res.status(500).json({
            success: false,
            message: 'গঠনতন্ত্র লোড ব্যর্থ: ' + err.message
        });
    }
};

// ২. ডাটাবেজে গঠনতন্ত্র ইনসার্ট করা (অ্যাডমিনের জন্য)
exports.uploadConstitution = async (req, res) => {
    try {
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();

        if (!['ADMIN', 'SUPERADMIN'].includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'আপনার এই অ্যাক্সেস নেই।'
            });
        }

        // মেইন অ্যাডমিন প্যানেল থেকে society_id এবং file_url পাঠানো হবে
        const { society_id, title, file_url } = req.body;

        if (!society_id || !file_url) {
            return res.status(400).json({ 
                success: false, 
                message: 'society_id এবং file_url প্রদান করা বাধ্যতামূলক।' 
            });
        }

        await db.query(
            `INSERT INTO constitutions (society_id, title, file_url) VALUES (?, ?, ?)`,
            [society_id, title || 'মসজিদের গঠনতন্ত্র', file_url]
        );

        res.json({ 
            success: true, 
            message: 'গঠনতন্ত্র ডাটাবেজে সফলভাবে যুক্ত করা হয়েছে।' 
        });
    } catch (err) {
        console.error("uploadConstitution Error:", err);
        res.status(500).json({ 
            success: false, 
            message: 'আপলোড ব্যর্থ: ' + err.message 
        });
    }
};