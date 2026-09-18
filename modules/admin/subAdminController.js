const db = require('../../config/db');
const bcrypt = require('bcryptjs');

// ১. সকল সাব-এডমিন ও তাদের পদবি/ট্যাগসহ তালিকা দেখা
exports.getAllSubAdmins = async (req, res) => {
    try {
        const [subAdmins] = await db.query(`
            SELECT id, name, phone, base_role, designation, status, created_at
            FROM users
            WHERE UPPER(base_role) = 'SUB_ADMIN'
            ORDER BY name ASC
        `);

        res.json({
            success: true,
            message: 'সাব-এডমিনদের তালিকা সফলভাবে পাওয়া গেছে।',
            subAdmins: subAdmins
        });
    } catch (error) {
        console.error("getAllSubAdmins Error:", error);
        res.status(500).json({
            success: false,
            message: 'তালিকা আনতে সমস্যা হয়েছে: ' + error.message
        });
    }
};

// ২. ড্যাশবোর্ড থেকে সরাসরি নতুন সাব-এডমিন তৈরি (নাম, ফোন, পাসওয়ার্ড ও পদবি/ট্যাগসহ)
exports.createSubAdmin = async (req, res) => {
    try {
        const requesterId = req.user?.id || req.user?.userId;
        const { name, phone, password, designation } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ success: false, message: 'নাম, মোবাইল নম্বর এবং পাসওয়ার্ড আবশ্যক।' });
        }

        if (!requesterId) {
            return res.status(401).json({ success: false, message: 'অথেন্টিকেশন টোকেন পাওয়া যায়নি বা মেয়াদোত্তীর্ণ।' });
        }

        // সরাসরি ডাটাবেজ থেকে রিকোয়েস্টকারী ইউজারের base_role যাচাই করা
        const [adminCheck] = await db.query(`SELECT base_role FROM users WHERE id = ?`, [requesterId]);
        
        if (adminCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'অননুমোদিত ইউজার!' });
        }

        const userRole = (adminCheck[0].base_role || '').toUpperCase();
        const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'অননুমোদিত অ্যাক্সেস! শুধুমাত্র মূল এডমিন সাব-এডমিন তৈরি করতে পারবেন।' });
        }

        // মোবাইল নম্বর দিয়ে ইতিপূর্বে অ্যাকাউন্ট আছে কি না চেক
        const [existing] = await db.query(`SELECT id FROM users WHERE phone = ?`, [phone.trim()]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'এই মোবাইল নম্বর দিয়ে ইতোমধ্যেই অ্যাকাউন্ট রয়েছে।' });
        }

        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const subAdminDesignation = designation ? designation.trim() : 'সহকারী';

        const [insertResult] = await db.query(`
            INSERT INTO users (name, phone, password_hash, base_role, designation, status)
            VALUES (?, ?, ?, 'SUB_ADMIN', ?, 'ACTIVE')
        `, [name.trim(), phone.trim(), hashedPassword, subAdminDesignation]);

        res.status(201).json({
            success: true,
            message: 'সাব-এডমিন সফলভাবে তৈরি করা হয়েছে।',
            userId: insertResult.insertId
        });
    } catch (error) {
        console.error("createSubAdmin Error:", error);
        res.status(500).json({ success: false, message: 'সাব-এডমিন তৈরি করতে ব্যর্থ হয়েছে: ' + error.message });
    }
};

// ৩. সাব-এডমিনের তথ্য বা পদবি/ট্যাগ এডিট করা
exports.updateSubAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, designation, status } = req.body;

        const [existing] = await db.query(`SELECT id, base_role FROM users WHERE id = ?`, [id]);
        if (existing.length === 0 || (existing[0].base_role || '').toUpperCase() !== 'SUB_ADMIN') {
            return res.status(404).json({ success: false, message: 'সাব-এডমিন পাওয়া যায়নি।' });
        }

        await db.query(`
            UPDATE users SET 
            name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            designation = COALESCE(?, designation),
            status = COALESCE(?, status)
            WHERE id = ?
        `, [name, phone, designation, status, id]);

        res.json({
            success: true,
            message: 'সাব-এডমিনের তথ্য সফলভাবে হালনাগাদ করা হয়েছে।'
        });
    } catch (error) {
        console.error("updateSubAdmin Error:", error);
        res.status(500).json({ success: false, message: 'হালনাগাদ করতে ব্যর্থ হয়েছে: ' + error.message });
    }
};

// ৪. সাব-এডমিন অ্যাকাউন্ট ডিলিট বা মুছে ফেলা
exports.deleteSubAdmin = async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.query(`SELECT id, base_role FROM users WHERE id = ?`, [id]);
        if (existing.length === 0 || (existing[0].base_role || '').toUpperCase() !== 'SUB_ADMIN') {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'সাব-এডমিন পাওয়া যায়নি।' });
        }

        // সংশ্লিষ্ট পারমিশনগুলোও পরিষ্কার করে দেওয়া
        try { await connection.query(`DELETE FROM user_feature_permissions WHERE user_id = ?`, [id]); } catch (e) {}
        
        await connection.query(`DELETE FROM users WHERE id = ?`, [id]);

        await connection.commit();
        res.json({
            success: true,
            message: 'সাব-এডমিন অ্যাকাউন্ট সফলভাবে মুছে ফেলা হয়েছে।'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("deleteSubAdmin Error:", error);
        res.status(500).json({ success: false, message: 'মুছে ফেলতে ব্যর্থ হয়েছে: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
};