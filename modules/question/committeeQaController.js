const db = require('../../config/db');

// পারমিশন চেক করার হেল্পার ফাংশন (কমিটির জন্য)
async function getCommitteeQaPermissions(userId, userRole) {
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
             WHERE ufp.user_id = ? AND sf.feature_key = 'committee_qa'
             LIMIT 1`,
            [userId]
        );
        if (rows.length > 0 && (rows[0].can_create === 1 || rows[0].can_edit === 1)) {
            return { can_answer: 1, can_delete: rows[0].can_delete ? 1 : 0 };
        }
    } catch (e) {
        console.warn("Committee QA Permission check error:", e.message);
    }
    return { can_answer: 0, can_delete: 0 };
}

// ১. সকল কমিটির প্রশ্নের তালিকা (লিস্ট ভিউ)
exports.getAllCommitteeQuestions = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const perms = await getCommitteeQaPermissions(userId, userRole);

        const [questions] = await db.query(`
            SELECT q.id, q.created_at, u.name AS author_name,
                   q.question AS initial_question,
                   (SELECT COUNT(*) FROM committee_question_replies WHERE question_id = q.id) AS answer_count
            FROM committee_questions q
            JOIN users u ON q.user_id = u.id
            ORDER BY q.id DESC
        `);

        res.json({
            success: true,
            questions: questions,
            permissions: perms
        });
    } catch (err) {
        console.error("getAllCommitteeQuestions Error:", err);
        res.status(500).json({ success: false, message: 'ডাটা লোড ব্যর্থ: ' + err.message });
    }
};

// ২. নির্দিষ্ট একটি কমিটির প্রশ্নের ভেতরের সম্পূর্ণ কনভারসেশন বা চ্যাট থ্রেড দেখা
exports.getCommitteeQuestionThread = async (req, res) => {
    try {
        const questionId = req.params.id || req.params.questionId;
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';

        // মূল প্রশ্ন লোড
        const [questionRows] = await db.query(`
            SELECT q.id, q.user_id, u.name AS author_name, q.question, q.created_at
            FROM committee_questions q
            JOIN users u ON q.user_id = u.id
            WHERE q.id = ?
        `, [questionId]);

        if (questionRows.length === 0) {
            return res.status(404).json({ success: false, message: 'প্রশ্নটি খুঁজে পাওয়া যায়নি।' });
        }

        const question = questionRows[0];

        // ইউজার এই থ্রেডে রিপ্লাই দেওয়ার অধিকার রাখে কিনা তা চেক করা (প্রশ্নকারী অথবা অ্যাডমিন/অথরাইজড)
        const perms = await getCommitteeQaPermissions(userId, userRole);
        const isAdminOrAuthorized = perms.can_answer === 1 || ['ADMIN', 'SUPERADMIN'].includes((userRole || '').toUpperCase());
        const isAuthor = question.user_id === userId;
        const canReply = isAdminOrAuthorized || isAuthor;

        // রিপ্লাই লোড
        const [replies] = await db.query(`
            SELECT r.id, r.user_id AS sender_id, u.name AS sender_name, r.reply AS message, r.created_at
            FROM committee_question_replies r
            JOIN users u ON r.user_id = u.id
            WHERE r.question_id = ?
            ORDER BY r.id ASC
        `, [questionId]);

        res.json({
            success: true,
            question: question,
            conversation: replies,
            can_reply: canReply ? 1 : 0 // ফ্রন্টএন্ডে বা অ্যাপে ইনপুট বক্স কন্ট্রোল করার জন্য
        });
    } catch (err) {
        console.error("getCommitteeQuestionThread Error:", err);
        res.status(500).json({ success: false, message: 'কনভারসেশন লোড ব্যর্থ: ' + err.message });
    }
};

// ৩. নতুন প্রশ্ন শুরু করা অথবা থ্রেডে উত্তর/রিপ্লাই যোগ করা (সুরক্ষিত লজিক সহ)
exports.addCommitteeReplyOrQuestion = async (req, res) => {
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

        connection = await db.getConnection();
        await connection.beginTransaction();

        let targetQuestionId = question_id;

        // নতুন প্রশ্ন হলে (যেকেউ করতে পারবে)
        if (!targetQuestionId) {
            const [qResult] = await connection.query(
                `INSERT INTO committee_questions (user_id, question) VALUES (?, ?)`,
                [userId, message.trim()]
            );
            targetQuestionId = qResult.insertId;
        } else {
            // বিদ্যমান থ্রেডে রিপ্লাই হলে চেক করতে হবে সে প্রশ্নকারী কি না অথবা অ্যাডমিন কি না
            const [checkQ] = await connection.query(`SELECT id, user_id FROM committee_questions WHERE id = ?`, [targetQuestionId]);
            if (checkQ.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'মূল প্রশ্নটি পাওয়া যায়নি।' });
            }

            const questionAuthorId = checkQ[0].user_id;
            const perms = await getCommitteeQaPermissions(userId, userRole);
            const isAdminOrAuthorized = perms.can_answer === 1 || ['ADMIN', 'SUPERADMIN'].includes(userRole.toUpperCase());
            const isAuthor = questionAuthorId === userId;

            // কড়া চেক: শুধুমাত্র প্রশ্নকারী এবং অ্যাডমিন/অথরাইজড পার্সন রিপ্লাই দিতে পারবে
            if (!isAdminOrAuthorized && !isAuthor) {
                await connection.rollback();
                return res.status(403).json({ success: false, message: 'এই থ্রেডে উত্তর দেওয়ার অনুমতি আপনার নেই। শুধুমাত্র প্রশ্নকারী এবং অ্যাডমিন উত্তর দিতে পারবেন।' });
            }
            
            // রিপ্লাই সংরক্ষণ
            await connection.query(
                `INSERT INTO committee_question_replies (question_id, user_id, reply) VALUES (?, ?, ?)`,
                [targetQuestionId, userId, message.trim()]
            );
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'আপনার বক্তব্য সফলভাবে যুক্ত হয়েছে।',
            question_id: targetQuestionId
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("addCommitteeReplyOrQuestion Error:", err);
        res.status(500).json({ success: false, message: 'সংরক্ষণ ব্যর্থ: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
};

// ৪. প্রশ্ন ও সম্পূর্ণ কনভারসেশন ডিলিট করা
exports.deleteCommitteeQuestionThread = async (req, res) => {
    let connection;
    try {
        const questionId = req.params.id || req.params.questionId;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';

        const perms = await getCommitteeQaPermissions(userId, userRole);
        if (perms.can_delete !== 1 && userRole.toUpperCase() !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'মুছে ফেলার অনুমতি নেই।' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query('DELETE FROM committee_question_replies WHERE question_id = ?', [questionId]);
        await connection.query('DELETE FROM committee_questions WHERE id = ?', [questionId]);

        await connection.commit();
        res.json({ success: true, message: 'প্রশ্ন ও এর সম্পূর্ণ কনভারসেশন মুছে ফেলা হয়েছে।' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("deleteCommitteeQuestionThread Error:", err);
        res.status(500).json({ success: false, message: 'ডিলিট ব্যর্থ: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
};