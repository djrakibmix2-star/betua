const db = require('../../config/db');

// ইউজারের পারমিশন চেক করার হেল্পার ফাংশন (সবগুলো Integer আকারে)
async function getUserPollPermissions(userId, userRole) {
    const roleUpper = (userRole || '').toUpperCase();
    let canCreate = 0, canEdit = 0, canDelete = 0, canVote = 1;

    if (['ADMIN', 'SUPERADMIN', 'SUB_ADMIN'].includes(roleUpper)) {
        canCreate = 1;
        canEdit = 1;
        canDelete = 1;
        canVote = 0; // অ্যাডমিন অ্যাকাউন্ট থেকে ভোট দেওয়া নিষিদ্ধ
    } else if (!userId) {
        canCreate = 0;
        canEdit = 0;
        canDelete = 0;
        canVote = 0;
    } else {
        try {
            const [rows] = await db.query(
                `SELECT ufp.can_create, ufp.can_edit, ufp.can_delete 
                 FROM user_feature_permissions ufp
                 JOIN system_features sf ON ufp.feature_id = sf.id
                 WHERE ufp.user_id = ? AND sf.feature_key = 'polls'
                 LIMIT 1`,
                [userId]
            );

            if (rows.length > 0) {
                canCreate = rows[0].can_create ? 1 : 0;
                canEdit = rows[0].can_edit ? 1 : 0;
                canDelete = rows[0].can_delete ? 1 : 0;
                canVote = 1;
            }
        } catch (e) {
            console.warn("Poll permission query check:", e.message);
        }
    }

    // অ্যান্ড্রয়েড অ্যাপের Kotlin মডেলের সাথে মিল রাখতে সবগুলো Integer (0 বা 1) পাঠানো হলো
    return {
        can_create: canCreate,
        canCreate: canCreate,
        can_edit: canEdit,
        canEdit: canEdit,
        can_delete: canDelete,
        canDelete: canDelete,
        can_vote: canVote,
        canVote: canVote
    };
}

// ১. সকল পোলের তালিকা (অপশন, পার্সেন্টেজ, ফ্যামিলি কাউন্ট ও ভোটিং স্ট্যাটাসসহ)
exports.getAllPolls = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';

        // মেয়াদ শেষ হয়ে যাওয়া সক্রিয় পোলগুলোকে স্বয়ংক্রিয়ভাবে CLOSED করা
        await db.query(
            "UPDATE polls SET status = 'CLOSED' WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= NOW()"
        );

        const [polls] = await db.query(
            `SELECT p.* 
             FROM polls p
             ORDER BY CASE WHEN p.status = 'ACTIVE' THEN 0 ELSE 1 END, p.id DESC`
        );

        let userVotedPollIds = new Set();
        if (userId) {
            const [votedRows] = await db.query(
                'SELECT DISTINCT poll_id FROM poll_votes WHERE user_id = ?',
                [userId]
            );
            votedRows.forEach(r => userVotedPollIds.add(r.poll_id));
        }

        const formattedPolls = [];
        for (const p of polls) {
            // প্রতিটি পোলের আন্ডারে থাকা অপশনগুলো এবং প্রতি অপশনে কতটি ভোট পড়েছে তা আনা
            const [options] = await db.query(
                `SELECT po.id AS option_id, po.option_text,
                        COUNT(pv.id) AS vote_count
                 FROM poll_options po
                 LEFT JOIN poll_votes pv ON po.id = pv.option_id
                 WHERE po.poll_id = ?
                 GROUP BY po.id, po.option_text`,
                [p.id]
            );

            // মোট ভোট গণনা
            let totalVotes = 0;
            options.forEach(opt => {
                totalVotes += parseInt(opt.vote_count) || 0;
            });

            // মোট কতটি পরিবার ভোট দিয়েছে তার হিসাব
            const [familyCountRows] = await db.query(
                'SELECT COUNT(DISTINCT user_id) AS total_families FROM poll_votes WHERE poll_id = ?',
                [p.id]
            );
            const totalFamilies = parseInt(familyCountRows[0]?.total_families) || 0;

            // প্রতিটি অপশনের পার্সেন্টেজ হিসাব করা
            const formattedOptions = options.map(opt => {
                const count = parseInt(opt.vote_count) || 0;
                const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                return {
                    option_id: opt.option_id,
                    option_text: opt.option_text,
                    vote_count: count,
                    percentage: percentage
                };
            });

            formattedPolls.push({
                id: p.id,
                title: p.title,
                description: p.description,
                status: p.status,
                expires_at: p.expires_at,
                created_at: p.created_at,
                options: formattedOptions,
                total_votes: totalVotes,
                total_families_voted: totalFamilies,
                has_user_voted: userVotedPollIds.has(p.id)
            });
        }

        const permissions = await getUserPollPermissions(userId, userRole);

        res.json({
            success: true,
            polls: formattedPolls,
            permissions: permissions
        });
    } catch (err) {
        console.error("getAllPolls Error:", err);
        res.status(500).json({
            success: false,
            message: 'পোল তালিকা লোড করা যায়নি: ' + err.message
        });
    }
};

// ২. নতুন পোল তৈরি করা (একাধিক ম্যানুয়াল অপশনসহ)
exports.createPoll = async (req, res) => {
    let connection;
    try {
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const perms = await getUserPollPermissions(userId, userRole);

        if (perms.can_create !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার নতুন মতামত পোল তৈরি করার অনুমতি নেই।'
            });
        }

        const [activeRows] = await db.query(
            "SELECT COUNT(*) AS totalActive FROM polls WHERE status = 'ACTIVE'"
        );
        if (activeRows[0].totalActive >= 5) {
            return res.status(400).json({
                success: false,
                message: 'বর্তমানে সর্বোচ্চ ৫টি পোল কার্যকর রয়েছে। পূর্বের কোনো পোল সমাপ্ত না হওয়া পর্যন্ত নতুন পোল তৈরি করা যাবে না।'
            });
        }

        const { title, description, options, expires_at, duration_hours, duration_minutes } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'পোলের শিরোনাম দেওয়া বাধ্যতামূলক।'
            });
        }

        if (!options || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'কমপক্ষে দুটি পোল অপশন প্রদান করা বাধ্যতামূলক।'
            });
        }

        let finalExpiresAt = null;
        if (expires_at) {
            finalExpiresAt = new Date(expires_at);
        } else if ((duration_hours !== undefined && !isNaN(duration_hours)) || (duration_minutes !== undefined && !isNaN(duration_minutes))) {
            const h = parseFloat(duration_hours || 0);
            const m = parseFloat(duration_minutes || 0);
            finalExpiresAt = new Date(Date.now() + (h * 60 * 60 * 1000) + (m * 60 * 1000));
        } else {
            finalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); 
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [pollResult] = await connection.query(
            `INSERT INTO polls (title, description, expires_at, created_by, status)
             VALUES (?, ?, ?, ?, 'ACTIVE')`,
            [title.trim(), description ? description.trim() : '', finalExpiresAt, userId]
        );
        const pollId = pollResult.insertId;

        for (const optText of options) {
            if (optText && optText.trim() !== '') {
                await connection.query(
                    `INSERT INTO poll_options (poll_id, option_text) VALUES (?, ?)`,
                    [pollId, optText.trim()]
                );
            }
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'নতুন মতামত পোল ও অপশনসমূহ সফলভাবে তৈরি হয়েছে।'
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("createPoll Error:", err);
        res.status(500).json({
            success: false,
            message: 'পোল তৈরি ব্যর্থ: ' + err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

// ৩. পোল এডিট ও সময় বাড়ানো
exports.updatePoll = async (req, res) => {
    try {
        const pollId = req.params.pollId || req.params.id;
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const perms = await getUserPollPermissions(userId, userRole);

        if (perms.can_edit !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার এই পোল সম্পাদনা করার অনুমতি নেই।'
            });
        }

        const { title, description, status, expires_at, extend_hours, extend_minutes } = req.body;

        const [pollCheck] = await db.query('SELECT expires_at, status FROM polls WHERE id = ?', [pollId]);
        if (pollCheck.length === 0) {
            return res.status(404).json({ success: false, message: 'পোলটি খুঁজে পাওয়া যায়নি।' });
        }

        let newExpiresAt = expires_at ? new Date(expires_at) : pollCheck[0].expires_at;

        const h = parseFloat(extend_hours || 0);
        const m = parseFloat(extend_minutes || 0);

        if (h > 0 || m > 0) {
            const baseTime = pollCheck[0].expires_at && new Date(pollCheck[0].expires_at) > new Date() 
                ? new Date(pollCheck[0].expires_at) 
                : new Date();
            
            newExpiresAt = new Date(baseTime.getTime() + (h * 60 * 60 * 1000) + (m * 60 * 1000));
        }

        let targetStatus = status || pollCheck[0].status;
        if ((h > 0 || m > 0) && targetStatus === 'CLOSED') {
            targetStatus = 'ACTIVE';
        }

        await db.query(
            `UPDATE polls 
             SET title = COALESCE(?, title),
                 description = COALESCE(?, description),
                 status = COALESCE(?, status),
                 expires_at = COALESCE(?, expires_at)
             WHERE id = ?`,
            [
                title ? title.trim() : null, 
                description !== undefined ? description.trim() : null, 
                targetStatus, 
                newExpiresAt, 
                pollId
            ]
        );

        res.json({
            success: true,
            message: 'পোলের বিস্তারিত তথ্য ও সময় সফলভাবে আপডেট করা হয়েছে।'
        });
    } catch (err) {
        console.error("updatePoll Error:", err);
        res.status(500).json({
            success: false,
            message: 'পোল আপডেট ব্যর্থ: ' + err.message
        });
    }
};

// ৪. পরিবারের সদস্যদের ভোট প্রদান (নির্দিষ্ট optionId সহ)
exports.submitFamilyVotes = async (req, res) => {
    let connection;
    try {
        const pollId = req.params.pollId || req.params.id;
        const userId = req.user?.id || req.user?.userId;
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();
        const { votes } = req.body; 

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'ভোট দেওয়ার জন্য লগইন থাকা বাধ্যতামূলক।'
            });
        }

        if (['ADMIN', 'SUPERADMIN', 'SUB_ADMIN'].includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'এডমিন অথবা সাব-এডমিন অ্যাকাউন্ট থেকে কোনো ভোট প্রদান করা নিষিদ্ধ।'
            });
        }

        if (!votes) {
            return res.status(400).json({
                success: false,
                message: 'সদস্যদের ভোটের তথ্য প্রদান করা হয়নি।'
            });
        }

        const voteList = [];
        if (Array.isArray(votes)) {
            votes.forEach(v => {
                voteList.push({
                    memberNumber: parseInt(v.memberNumber || v.member_number || 1),
                    optionId: parseInt(v.optionId || v.option_id)
                });
            });
        } else if (typeof votes === 'object') {
            Object.keys(votes).forEach(key => {
                voteList.push({
                    memberNumber: parseInt(key),
                    optionId: parseInt(votes[key])
                });
            });
        }

        if (voteList.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'কোনো বৈধ সদস্যের ভোট পাওয়া যায়নি।'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [pollRows] = await connection.query(
            'SELECT status, expires_at FROM polls WHERE id = ?',
            [pollId]
        );

        if (pollRows.length === 0 || pollRows[0].status !== 'ACTIVE') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'এই পোলটি সমাপ্ত হয়ে গেছে অথবা খুঁজে পাওয়া যায়নি।'
            });
        }

        if (pollRows[0].expires_at && new Date(pollRows[0].expires_at) <= new Date()) {
            await connection.query("UPDATE polls SET status = 'CLOSED' WHERE id = ?", [pollId]);
            await connection.commit();
            return res.status(400).json({
                success: false,
                message: 'এই পোলের সময়সীমা সমাপ্ত হয়ে গেছে। নতুন কোনো ভোট গ্রহণযোগ্য নয়।'
            });
        }

        const [existingVote] = await connection.query(
            'SELECT id FROM poll_votes WHERE poll_id = ? AND user_id = ? LIMIT 1',
            [pollId, userId]
        );

        if (existingVote.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'আপনার পরিবার থেকে এই পোলে ইতিপূর্বে ভোট প্রদান করা হয়েছে।'
            });
        }

        for (const v of voteList) {
            const [optCheck] = await connection.query(
                'SELECT id FROM poll_options WHERE id = ? AND poll_id = ?',
                [v.optionId, pollId]
            );
            if (optCheck.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `ভুল অপশন আইডি প্রদান করা হয়েছে (${v.optionId})।`
                });
            }
        }

        const insertPromises = voteList.map(v => {
            return connection.query(
                `INSERT INTO poll_votes (poll_id, user_id, family_member_number, option_id)
                 VALUES (?, ?, ?, ?)`,
                [pollId, userId, v.memberNumber, v.optionId]
            );
        });

        await Promise.all(insertPromises);
        await connection.commit();

        res.json({
            success: true,
            message: `আপনার পরিবারের ${voteList.length} জন সদস্যের মতামত সফলভাবে গৃহীত হয়েছে।`
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("submitFamilyVotes Error:", err);
        res.status(500).json({
            success: false,
            message: 'ভোট প্রদান ব্যর্থ: ' + err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

// ৫. পোল সমাপ্ত/ক্লোজ করা
exports.closePoll = async (req, res) => {
    try {
        const pollId = req.params.pollId || req.params.id;
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const perms = await getUserPollPermissions(userId, userRole);

        if (perms.can_edit !== 1 && perms.can_delete !== 1) {
            return res.status(403).json({
                success: false,
                message: 'পোল সমাপ্ত করার অনুমতি আপনার নেই।'
            });
        }

        const [result] = await db.query(
            "UPDATE polls SET status = 'CLOSED' WHERE id = ?",
            [pollId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'পোলটি খুঁজে পাওয়া যায়নি।'
            });
        }

        res.json({
            success: true,
            message: 'পোলটি সফলভাবে সমাপ্ত ঘোষণা করা হয়েছে।'
        });
    } catch (err) {
        console.error("closePoll Error:", err);
        res.status(500).json({
            success: false,
            message: 'পোল সমাপ্ত করতে ব্যর্থ: ' + err.message
        });
    }
};

// ৬. পোল ডিলিট করা
exports.deletePoll = async (req, res) => {
    let connection;
    try {
        const pollId = req.params.pollId || req.params.id;
        const userId = req.user?.id || req.user?.userId || null;
        const userRole = req.user?.role || req.user?.base_role || 'MEMBER';
        const perms = await getUserPollPermissions(userId, userRole);

        if (perms.can_delete !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার এই পোল মুছে ফেলার অনুমতি নেই।'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query('DELETE FROM poll_votes WHERE poll_id = ?', [pollId]);
        await connection.query('DELETE FROM poll_options WHERE poll_id = ?', [pollId]);
        const [result] = await connection.query('DELETE FROM polls WHERE id = ?', [pollId]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'পোলটি খুঁজে পাওয়া যায়নি।'
            });
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'পোল ও এর সকল অপশন ও ভোট সফলভাবে মুছে ফেলা হয়েছে।'
        });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("deletePoll Error:", err);
        res.status(500).json({
            success: false,
            message: 'পোল ডিলিট ব্যর্থ: ' + err.message
        });
    } finally {
        if (connection) connection.release();
    }
};