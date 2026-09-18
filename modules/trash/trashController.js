const db = require('../../config/db');

// ট্র্যাশ বক্সের সব আইটেম একসাথে দেখার এপিআই
exports.getAllTrashItems = async (req, res) => {
    try {
        // ১. ডিলিট হওয়া সদস্যগণ
        const [members] = await db.query(`
            SELECT u.id, u.name, u.phone, 'member' AS type, u.updated_at AS deleted_at, del.name as deleted_by_name 
            FROM users u 
            LEFT JOIN users del ON u.deleted_by = del.id 
            WHERE u.is_deleted = 1 
            ORDER BY u.id DESC
        `);

        // ২. ডিলিট হওয়া ফান্ডের লেনদেন (fund_transactions টেবিল থেকে)
        let transactions = [];
        try {
            const [tRows] = await db.query(`
                SELECT t.id, t.amount, t.type, 'transaction' AS type_name, t.updated_at AS deleted_at, del.name as deleted_by_name 
                FROM fund_transactions t 
                LEFT JOIN users del ON t.deleted_by = del.id 
                WHERE t.is_deleted = 1 
                ORDER BY t.id DESC
            `);
            transactions = tRows;
        } catch (e) {
            console.warn("Transactions trash fetch warning:", e.message);
        }

        // ৩. ডিলিট হওয়া নোটিশ
        let notices = [];
        try {
            const [nRows] = await db.query(`
                SELECT n.id, n.title, 'notice' AS type_name, n.updated_at AS deleted_at, del.name as deleted_by_name 
                FROM notices n 
                LEFT JOIN users del ON n.deleted_by = del.id 
                WHERE n.is_deleted = 1 
                ORDER BY n.id DESC
            `);
            notices = nRows;
        } catch (e) {
            console.warn("Notices trash fetch warning:", e.message);
        }

        res.json({
            success: true,
            trash: {
                members,
                transactions,
                notices
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ট্র্যাশ থেকে পুনরুদ্ধার (Restore) করা
exports.restoreTrashItem = async (req, res) => {
    const { type, id } = req.params;
    try {
        let tableName = '';
        if (type === 'member') tableName = 'users';
        else if (type === 'transaction') tableName = 'fund_transactions';
        else if (type === 'notice') tableName = 'notices';
        else return res.status(400).json({ success: false, message: 'ভুল টাইপ নির্বাচন করা হয়েছে।' });

        await db.query(`UPDATE ?? SET is_deleted = 0, deleted_by = NULL WHERE id = ?`, [tableName, id]);
        res.json({ success: true, message: 'সফলভাবে পুনরুদ্ধার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// স্থায়ীভাবে মুছে ফেলা (Permanent Delete)
exports.permanentDeleteTrashItem = async (req, res) => {
    const { type, id } = req.params;
    try {
        let tableName = '';
        if (type === 'member') tableName = 'users';
        else if (type === 'transaction') tableName = 'fund_transactions';
        else if (type === 'notice') tableName = 'notices';
        else return res.status(400).json({ success: false, message: 'ভুল টাইপ নির্বাচন করা হয়েছে।' });

        await db.query(`DELETE FROM ?? WHERE id = ?`, [tableName, id]);
        res.json({ success: true, message: 'স্থায়ীভাবে মুছে ফেলা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};