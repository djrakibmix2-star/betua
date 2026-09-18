const db = require('../../config/db');

// কলাম ডিটেকশন (author_id অথবা created_by)
const getAuthorColumnName = async () => {
    try {
        const [columns] = await db.query(`SHOW COLUMNS FROM notices LIKE 'created_by'`);
        return columns.length > 0 ? 'created_by' : 'author_id';
    } catch (e) {
        return 'created_by';
    }
};

// ১. সব সক্রিয় নোটিশ পাওয়ার এপিআই (ট্র্যাশে থাকা বাদ দিয়ে)
exports.getAllNotices = async (req, res) => {
    try {
        const authorCol = await getAuthorColumnName();

        const query = `
            SELECT n.id, n.title, n.description, n.category, 
                   COALESCE(n.is_pinned, 0) AS isPinned, 
                   COALESCE(n.is_pinned, 0) AS is_pinned, 
                   n.created_at AS createdAt, 
                   n.created_at AS created_at, 
                   n.updated_at AS updatedAt,
                   n.updated_at AS updated_at,
                   u.name AS authorName,
                   u.name AS author_name,
                   up.name AS updatedByName,
                   up.name AS updated_by_name
            FROM notices n
            LEFT JOIN users u ON n.${authorCol} = u.id
            LEFT JOIN users up ON n.updated_by = up.id
            WHERE n.is_deleted = 0 OR n.is_deleted IS NULL
            ORDER BY n.is_pinned DESC, n.created_at DESC
        `;
        const [notices] = await db.query(query);

        // পারমিশন হিসাব
        let userPermissions = {
            canCreate: 0,
            canEdit: 0,
            canDelete: 0,
            can_create: 0,
            can_edit: 0,
            can_delete: 0
        };

        const user = req.user;
        if (user) {
            const userId = user.id || user.userId;
            const userRole = (user.role || user.base_role || '').toUpperCase();

            if (userRole === 'ADMIN') {
                userPermissions = {
                    canCreate: 1, canEdit: 1, canDelete: 1,
                    can_create: 1, can_edit: 1, can_delete: 1
                };
            } else if (userId) {
                const [permRows] = await db.query(`
                    SELECT ufp.can_create, ufp.can_edit, ufp.can_delete
                    FROM user_feature_permissions ufp
                    JOIN features f ON ufp.feature_id = f.id
                    WHERE ufp.user_id = ? AND LOWER(f.feature_key) IN ('notice', 'notices')
                `, [userId]);

                if (permRows.length > 0) {
                    const row = permRows[0];
                    const c = (row.can_create === 1 || row.can_create === true || row.can_create === '1') ? 1 : 0;
                    const e = (row.can_edit === 1 || row.can_edit === true || row.can_edit === '1') ? 1 : 0;
                    const d = (row.can_delete === 1 || row.can_delete === true || row.can_delete === '1') ? 1 : 0;

                    userPermissions = {
                        canCreate: c, canEdit: e, canDelete: d,
                        can_create: c, can_edit: e, can_delete: d
                    };
                }
            }
        }

        res.json({
            success: true,
            message: 'নোটিশ তালিকা সফলভাবে পাওয়া গেছে।',
            notices: notices,
            permissions: userPermissions
        });
    } catch (error) {
        console.error("getAllNotices Error:", error);
        res.status(500).json({ success: false, message: 'নোটিশ আনতে সমস্যা: ' + error.message, notices: [] });
    }
};

// ২. নতুন নোটিশ তৈরি
exports.createNotice = async (req, res) => {
    const { title, description, category, is_pinned, isPinned } = req.body;

    if (!title || !description) {
        return res.status(400).json({
            success: false,
            message: 'শিরোনাম এবং বিস্তারিত বিবরণ দুটোই পূরণ করতে হবে।'
        });
    }

    try {
        const authorId = req.user?.id || req.user?.userId;
        const authorCol = await getAuthorColumnName();
        const pinnedStatus = (is_pinned === true || is_pinned === 1 || isPinned === true || isPinned === 1) ? 1 : 0;
        const validCategory = category || 'সাধারণ';

        const insertQuery = `
            INSERT INTO notices (title, description, category, ${authorCol}, is_pinned, is_deleted)
            VALUES (?, ?, ?, ?, ?, 0)
        `;
        const [result] = await db.query(insertQuery, [
            title.trim(),
            description.trim(),
            validCategory.trim(),
            authorId,
            pinnedStatus
        ]);

        res.status(201).json({
            success: true,
            message: 'আলহামদুলিল্লাহ! নোটিশ সফলভাবে প্রকাশিত হয়েছে।',
            noticeId: result.insertId
        });
    } catch (error) {
        console.error("createNotice Error:", error);
        res.status(500).json({ success: false, message: 'নোটিশ সংরক্ষণ ব্যর্থ: ' + error.message });
    }
};

// ৩. নোটিশ আপডেট ও এডিটরের নাম/সময় সেভ করা
exports.updateNotice = async (req, res) => {
    const noticeId = req.params.id || req.params.noticeId;
    const { title, description, category, is_pinned, isPinned } = req.body;

    if (!title || !description) {
        return res.status(400).json({
            success: false,
            message: 'শিরোনাম এবং বিস্তারিত বিবরণ দেওয়া আবশ্যক।'
        });
    }

    try {
        const userId = req.user?.id || req.user?.userId;
        const pinnedStatus = (is_pinned === true || is_pinned === 1 || isPinned === true || isPinned === 1) ? 1 : 0;
        const validCategory = category || 'সাধারণ';

        const [result] = await db.query(
            `UPDATE notices 
             SET title = ?, description = ?, category = ?, is_pinned = ?, updated_by = ?, updated_at = NOW() 
             WHERE id = ?`,
            [title.trim(), description.trim(), validCategory.trim(), pinnedStatus, userId, noticeId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'নোটিশটি খুঁজে পাওয়া যায়নি।' });
        }

        res.json({
            success: true,
            message: 'নোটিশ সফলভাবে হালনাগাদ করা হয়েছে।'
        });
    } catch (error) {
        console.error("updateNotice Error:", error);
        res.status(500).json({ success: false, message: 'নোটিশ আপডেট করতে ব্যর্থ: ' + error.message });
    }
};

// ৪. সফট ডিলিট / রিসাইকেল বিন (সাব-অ্যাডমিন বা ইউজার ডিলিট করলে ট্র্যাশে যাবে)
exports.deleteNotice = async (req, res) => {
    const noticeId = req.params.id || req.params.noticeId;
    const userId = req.user?.id || req.user?.userId;
    const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();

    try {
        // যদি মূল ADMIN হয় এবং রিকোয়েস্টে পার্মানেন্ট ডিলিট চাওয়া হয়, তবে একেবারে মুছে যাবে। 
        // অন্যথায় সফট ডিলিট হয়ে ট্র্যাশ বক্সে চলে যাবে।
        if (userRole === 'ADMIN' && req.query.permanent === 'true') {
            const [result] = await db.query(`DELETE FROM notices WHERE id = ?`, [noticeId]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'নোটিশটি খুঁজে পাওয়া যায়নি।' });
            }
            return res.json({ success: true, message: 'নোটিশটি ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।' });
        }

        // সফট ডিলিট (Trash Box)
        const [result] = await db.query(
            `UPDATE notices SET is_deleted = 1, deleted_by = ? WHERE id = ?`,
            [userId, noticeId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'নোটিশটি খুঁজে পাওয়া যায়নি।' });
        }

        res.json({
            success: true,
            message: 'নোটিশটি সফলভাবে ডিলিট বক্সে পাঠানো হয়েছে।'
        });
    } catch (error) {
        console.error("deleteNotice Error:", error);
        res.status(500).json({ success: false, message: 'নোটিশ মুছতে ব্যর্থ: ' + error.message });
    }
};

// ৫. মূল অ্যাডমিনের জন্য ট্র্যাশ বক্সের নোটিশগুলো দেখার এপিআই
exports.getTrashNotices = async (req, res) => {
    try {
        const [notices] = await db.query(`
            SELECT n.*, u.name as deleted_by_name 
            FROM notices n 
            LEFT JOIN users u ON n.deleted_by = u.id 
            WHERE n.is_deleted = 1 
            ORDER BY n.id DESC
        `);
        res.json({ success: true, notices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৬. ট্র্যাশ থেকে নোটিশ পুনরুদ্ধার (Restore) করা
exports.restoreNotice = async (req, res) => {
    try {
        const noticeId = req.params.id;
        await db.query(`UPDATE notices SET is_deleted = 0, deleted_by = NULL WHERE id = ?`, [noticeId]);
        res.json({ success: true, message: 'নোটিশটি সফলভাবে পুনরুদ্ধার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};