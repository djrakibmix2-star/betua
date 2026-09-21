const pool = require('../../config/db'); // আপনার db.js ফাইলের সঠিক পাথ দিন

exports.checkUpdate = async (req, res) => {
    try {
        // ডাটাবেজ থেকে সর্বশেষ ভার্সনটি আনবে (id-এর descending order-এ)
        const [rows] = await pool.query('SELECT * FROM app_updates ORDER BY id DESC LIMIT 1');

        if (rows.length > 0) {
            res.json({
                success: true,
                update: rows[0]
            });
        } else {
            res.json({ success: false, message: "কোনো আপডেট তথ্য পাওয়া যায়নি।" });
        }
    } catch (error) {
        console.error("Update check error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};