const db = require('../../config/db'); // আপনার প্রজেক্টের ডেটাবেজ কনফিগ পাথ অনুযায়ী ঠিক করে নিবেন

// পারমিশন চেক করার হেল্পার ফাংশন (সাব-এডমিন বা ইমাম ও মেইন অ্যাডমিনের জন্য)
async function getQaPermissions(userId, userRole) {
    const roleUpper = (userRole || '').toUpperCase();
    if (['ADMIN', 'SUPERADMIN'].includes(roleUpper)) {
        return { can_answer: 1, can_delete: 1 };
    }
    if (!userId) return { can_answer: 0, can_delete: 0 };

    try {
        const [rows] = await db.query(
            `SELECT ufp.can_create, ufp.can_edit, ufp.can_delete 
             FROM user_feature_permissions ufp
             JOIN system_features sf ON ufp.feature_id = sf.id
             WHERE ufp.user_id = ? AND sf.feature_key = 'islamic_qa'
             LIMIT 1`,
            [userId]
        );
        if (rows.length > 0 && (rows[0].can_create === 1 || rows[0].can_edit === 1)) {
            return { can_answer: 1, can_delete: rows[0].can_delete ? 1 : 0 };
        }
    } catch (e) {
        console.warn("Permission check error:", e.message);
    }
    return { can_answer: 0, can_delete: 0 };
}

// ১. সকল মূল প্রশ্নের তালিকা (লিস্ট ভিউ)
exports.getAllQuestions = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const perms = await getQaPermissions(userId, userRole);

        const [questions] = await db.query(`
            SELECT q.id, q.created_at, u.name AS author_name,
                   (SELECT message FROM islamic_question_replies WHERE question_id = q.id AND is_admin_reply = 0 ORDER BY id ASC LIMIT 1) AS initial_question,
                   (SELECT COUNT(*) FROM islamic_question_replies WHERE question_id = q.id AND is_admin_reply = 1) AS answer_count
            FROM islamic_questions q
            JOIN users u ON q.user_id = u.id
            ORDER BY q.id DESC
        `);

        res.json({
            success: true,
            questions: questions,
            permissions: perms
        });
    } catch (err) {
        console.error("getAllQuestions Error:", err);
        res.status(500).json({ success: false, message: 'ডাটা লোড ব্যর্থ: ' + err.message });
    }
};

// ২. নির্দিষ্ট একটি প্রশ্নের ভেতরের সম্পূর্ণ কনভারসেশন বা চ্যাট থ্রেড দেখা
exports.getQuestionThread = async (req, res) => {
    try {
        const questionId = req.params.id || req.params.questionId;

        const [questionRows] = await db.query(`
            SELECT q.id, q.user_id, u.name AS author_name, q.created_at
            FROM islamic_questions q
            JOIN users u ON q.user_id = u.id
            WHERE q.id = ?
        `, [questionId]);

        if (questionRows.length === 0) {
            return res.status(404).json({ success: false, message: 'প্রশ্নটি খুঁজে পাওয়া যায়নি।' });
        }

        const [replies] = await db.query(`
            SELECT r.id, r.sender_id, u.name AS sender_name, r.message, r.is_admin_reply, r.created_at
            FROM islamic_question_replies r
            JOIN users u ON r.sender_id = u.id
            WHERE r.question_id = ?
            ORDER BY r.id ASC
        `, [questionId]);

        res.json({
            success: true,
            question: questionRows[0],
            conversation: replies
        });
    } catch (err) {
        console.error("getQuestionThread Error:", err);
        res.status(500).json({ success: false, message: 'কনভারসেশন লোড ব্যর্থ: ' + err.message });
    }
};

// ৩. নতুন প্রশ্ন শুরু করা অথবা বিদ্যমান থ্রেডে পাল্টা প্রশ্ন/উত্তর যোগ করা
exports.addReplyOrQuestion = async (req, res) => {
    let connection;
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const { question_id, message } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'লগইন করা বাধ্যতামূলক।' });
        }
        if (!message || message.trim() === '') {
            return res.status(400).json({ success: false, message: 'মেসেজ বা প্রশ্ন খালি রাখা যাবে না।' });
        }

        const perms = await getQaPermissions(userId, userRole);
        const isAdminOrImam = perms.can_answer === 1;

        connection = await db.getConnection();
        await connection.beginTransaction();

        let targetQuestionId = question_id;

        // নতুন প্রশ্ন হলে আগে মূল টেবলে এন্ট্রি হবে
        if (!targetQuestionId) {
            const [qResult] = await connection.query(
                `INSERT INTO islamic_questions (user_id) VALUES (?)`,
                [userId]
            );
            targetQuestionId = qResult.insertId;
        } else {
            const [checkQ] = await connection.query(`SELECT id FROM islamic_questions WHERE id = ?`, [targetQuestionId]);
            if (checkQ.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'মূল প্রশ্নটি পাওয়া যায়নি।' });
            }
        }

        // যদি ইমাম বা সাব-এডমিন উত্তর দেন, তবে is_admin_reply = 1 হবে
        const isImamReply = isAdminOrImam ? 1 : 0;

        await connection.query(
            `INSERT INTO islamic_question_replies (question_id, sender_id, message, is_admin_reply) VALUES (?, ?, ?, ?)`,
            [targetQuestionId, userId, message.trim(), isImamReply]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'আপনার বক্তব্য সফলভাবে যুক্ত হয়েছে।',
            question_id: targetQuestionId
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("addReplyOrQuestion Error:", err);
        res.status(500).json({ success: false, message: 'সংরক্ষণ ব্যর্থ: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
};

// ৪. প্রশ্ন ও সম্পূর্ণ কনভারসেশন ডিলিট করা (এডমিন বা সাব-এডমিনের জন্য)
exports.deleteQuestionThread = async (req, res) => {
    let connection;
    try {
        const questionId = req.params.id || req.params.questionId;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';

        const perms = await getQaPermissions(userId, userRole);
        if (perms.can_delete !== 1 && userRole.toUpperCase() !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'মুছে ফেলার অনুমতি নেই।' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query('DELETE FROM islamic_question_replies WHERE question_id = ?', [questionId]);
        await connection.query('DELETE FROM islamic_questions WHERE id = ?', [questionId]);

        await connection.commit();
        res.json({ success: true, message: 'প্রশ্ন ও এর সম্পূর্ণ কনভারসেশন মুছে ফেলা হয়েছে।' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("deleteQuestionThread Error:", err);
        res.status(500).json({ success: false, message: 'ডিলিট ব্যর্থ: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
};