const db = require('../../config/db');
const bcrypt = require('bcrypt');

// ইউজারের মেম্বার মডিউল পারমিশন হেল্পার
async function getMemberPermissions(userId, userRole) {
    if (userRole && ['ADMIN'].includes(userRole.toUpperCase())) {
        return { can_create: 1, can_edit: 1, can_delete: 1 };
    }

    if (!userId) {
        return { can_create: 0, can_edit: 0, can_delete: 0 };
    }

    try {
        const [rows] = await db.query(`
            SELECT ufp.can_create, ufp.can_edit, ufp.can_delete 
            FROM user_feature_permissions ufp
            JOIN system_features sf ON ufp.feature_id = sf.id
            WHERE ufp.user_id = ? AND sf.feature_key = 'members'
            LIMIT 1
        `, [userId]);

        if (rows.length > 0) {
            return {
                can_create: rows[0].can_create ? 1 : 0,
                can_edit: rows[0].can_edit ? 1 : 0,
                can_delete: rows[0].can_delete ? 1 : 0
            };
        }
    } catch (e) {
        console.warn("Member permission check warning:", e.message);
    }

    return { can_create: 0, can_edit: 0, can_delete: 0 };
}

// ১. সক্রিয় সদস্য তালিকা দেখা 
exports.getAllMembers = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();
        const isAdmin = userRole === 'ADMIN';

        const hiddenUserIds = [0]; 

        const query = `
            SELECT 
                u.id, 
                u.name, 
                u.phone, 
                u.father_name AS fatherName, 
                u.para_name AS paraName, 
                COALESCE(u.family_members_count, 1) AS familyMembersCount, 
                u.base_role AS role, 
                u.status, 
                u.created_at, 
                u.updated_at, 
                up.name AS updated_by_name, 
                up.name AS updatedByName, 
                CONCAT('', (10000 + u.id)) AS family_code, 
                GROUP_CONCAT(DISTINCT cm_head.designation SEPARATOR ', ') AS committee_designation, 
                CASE WHEN COUNT(cm_head.id) > 0 THEN 1 ELSE 0 END AS is_committee_member
            FROM users u
            LEFT JOIN committee_members cm_head 
                ON u.id = cm_head.user_id 
               AND (cm_head.family_member_id IS NULL OR cm_head.family_member_id = 0)
            LEFT JOIN users up ON u.updated_by = up.id
            WHERE UPPER(COALESCE(u.base_role, 'MEMBER')) NOT IN ('ADMIN', 'SUB_ADMIN')
              AND u.id NOT IN (?)
              AND (u.is_deleted = 0 OR u.is_deleted IS NULL)
              AND u.status = 'ACTIVE'
            GROUP BY u.id
            ORDER BY u.name ASC
        `;

        const [members] = await db.query(query, [hiddenUserIds]);

        if (members.length > 0) {
            const userIdsString = members.map(m => m.id).join(',');

            let familyRows = [];
            try {
                // এখানে cm_sub.name বাদ দিয়ে কেবল আইডি দিয়ে জয়েন করা হয়েছে
                const [fRows] = await db.query(
                    `SELECT 
                        ufm.id, 
                        ufm.user_id, 
                        ufm.member_name, 
                        ufm.relation, 
                        ufm.age,
                        cm_sub.designation AS committee_designation
                     FROM user_family_members ufm
                     LEFT JOIN committee_members cm_sub 
                        ON ufm.id = cm_sub.family_member_id
                     WHERE ufm.user_id IN (${userIdsString})`
                );
                familyRows = fRows;
            } catch (err) {
                try {
                    const [altRows] = await db.query(
                        `SELECT 
                            fm.id, 
                            fm.user_id, 
                            fm.member_name, 
                            fm.relation, 
                            fm.age,
                            cm_sub.designation AS committee_designation
                         FROM family_members fm
                         LEFT JOIN committee_members cm_sub 
                            ON fm.id = cm_sub.family_member_id
                         WHERE fm.user_id IN (${userIdsString})`
                    );
                    familyRows = altRows;
                } catch (e) {
                    console.error("Family list load error:", e.message);
                }
            }

            const familyMap = {};
            familyRows.forEach(row => {
                if (!familyMap[row.user_id]) {
                    familyMap[row.user_id] = [];
                }
                familyMap[row.user_id].push({
                    id: row.id,
                    member_name: row.member_name || '',
                    memberName: row.member_name || '',
                    relation: row.relation || 'সদস্য',
                    age: row.age ? parseInt(row.age) : null,
                    committee_designation: row.committee_designation || null,
                    is_committee_member: row.committee_designation ? 1 : 0
                });
            });

            members.forEach(m => {
                const fam = familyMap[m.id] || [];
                m.family_members = fam;
                m.familyMembers = fam;
                m.family_members_count = fam.length > 0 ? fam.length + 1 : (m.familyMembersCount || 1);
            });
        }

        const permissions = await getMemberPermissions(userId, userRole);

        res.json({
            success: true,
            isAdmin: isAdmin || permissions.can_edit === 1,
            permissions,
            message: 'সদস্যদের তালিকা সফলভাবে পাওয়া গেছে।',
            count: members.length,
            members: members
        });
    } catch (error) {
        console.error("getAllMembers Error:", error);
        res.status(500).json({
            success: false,
            message: 'সদস্যদের তালিকা আনতে সমস্যা হয়েছে: ' + error.message
        });
    }
};

// ২. নির্দিষ্ট সদস্যের বিস্তারিত তথ্য ফেচ করা
exports.getMemberDetailsById = async (req, res) => {
    try {
        const { memberId } = req.params;

        const [users] = await db.query(
            `SELECT 
                u.id, 
                u.name, 
                u.phone, 
                u.father_name, 
                u.para_name, 
                COALESCE(u.family_members_count, 1) AS family_members_count, 
                u.base_role, 
                u.status, 
                u.created_at, 
                u.updated_at, 
                up.name AS updated_by_name, 
                CONCAT('', (10000 + u.id)) AS family_code, 
                GROUP_CONCAT(DISTINCT cm_head.designation SEPARATOR ', ') AS committee_designation
             FROM users u
             LEFT JOIN committee_members cm_head 
                ON u.id = cm_head.user_id 
               AND (cm_head.family_member_id IS NULL OR cm_head.family_member_id = 0)
             LEFT JOIN users up ON u.updated_by = up.id
             WHERE u.id = ? AND (u.is_deleted = 0 OR u.is_deleted IS NULL)
             GROUP BY u.id`,
            [memberId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'সদস্য পাওয়া যায়নি।' });
        }

        const member = users[0];

        let familyMembers = [];
        try {
            const [fRows] = await db.query(
                `SELECT 
                    ufm.id, 
                    ufm.member_name, 
                    ufm.relation, 
                    ufm.age,
                    cm_sub.designation AS committee_designation
                 FROM user_family_members ufm
                 LEFT JOIN committee_members cm_sub 
                    ON ufm.id = cm_sub.family_member_id
                 WHERE ufm.user_id = ?`,
                [memberId]
            );
            familyMembers = fRows;
        } catch (e) {}

        member.family_members = familyMembers;
        member.familyMembers = familyMembers;

        res.json({
            success: true,
            member: member
        });
    } catch (error) {
        console.error("getMemberDetailsById Error:", error);
        res.status(500).json({
            success: false,
            message: 'সদস্যের বিস্তারিত আনতে ব্যর্থ: ' + error.message
        });
    }
};

// ৩. সদস্যের তথ্য এডিট করা 
exports.adminUpdateMember = async (req, res) => {
    let connection;
    try {
        const requesterId = req.user?.id || req.user?.userId;
        const { memberId } = req.params;
        const { name, phone, father_name, fatherName, para_name, paraName, base_role, role, status, family_members, familyMembers } = req.body;

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [requesterDbCheck] = await connection.query(`SELECT id, base_role FROM users WHERE id = ?`, [requesterId]);
        const isActualAdmin = requesterDbCheck.length > 0 && ['ADMIN'].includes((requesterDbCheck[0].base_role || '').toUpperCase());

        if (!isActualAdmin) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'অননুমোদিত অ্যাক্সেস! সদস্যের তথ্য পরিবর্তনের অধিকার শুধুমাত্র এডমিনের রয়েছে।'
            });
        }

        const [existing] = await connection.query(`SELECT id, base_role FROM users WHERE id = ?`, [memberId]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'সদস্য পাওয়া যায়নি।' });
        }

        const targetCurrentRole = (existing[0].base_role || '').toUpperCase();
        const incomingRole = base_role || role;
        const requestedNewRole = incomingRole ? incomingRole.toUpperCase() : targetCurrentRole;

        if (parseInt(requesterId) === parseInt(memberId) && requestedNewRole !== 'ADMIN') {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'এডমিন নিজের পদবী পরিবর্তন করতে পারবেন কাশী।'
            });
        }

        if (targetCurrentRole !== 'ADMIN' && requestedNewRole === 'ADMIN') {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: 'নতুন কাউকে এডমিন পদে উন্নীত করা সম্পূর্ণ নিষিদ্ধ। সিস্টেমে এডমিন অ্যাকাউন্ট কেবল একটিই থাকবে।'
            });
        }

        let finalRole = targetCurrentRole === 'ADMIN' ? 'ADMIN' : requestedNewRole;

        const rawFam = family_members || familyMembers;
        const membersList = Array.isArray(rawFam) ? rawFam : [];
        const familyCount = membersList.length;

        await connection.query(
            `UPDATE users SET 
             name = COALESCE(?, name),
             phone = COALESCE(?, phone),
             father_name = COALESCE(?, father_name),
             para_name = COALESCE(?, para_name),
             base_role = ?,
             status = COALESCE(?, status),
             family_members_count = ?,
             updated_by = ?,
             updated_at = NOW()
             WHERE id = ?`,
            [
                name, 
                phone, 
                father_name || fatherName, 
                para_name || paraName, 
                finalRole, 
                status, 
                familyCount, 
                requesterId, 
                memberId
            ]
        );

        try {
            await connection.query(`DELETE FROM user_family_members WHERE user_id = ?`, [memberId]);
            if (membersList.length > 0) {
                const memberInserts = membersList.map(m => {
                    const memberName = m.member_name || m.memberName || '';
                    const memberRelation = m.relation || 'সদস্য';
                    const memberAge = m.age ? parseInt(m.age) : null;

                    return connection.query(
                        `INSERT INTO user_family_members (user_id, member_name, relation, age, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
                        [memberId, memberName, memberRelation, memberAge]
                    );
                });
                await Promise.all(memberInserts);
            }
        } catch (e) {
            console.warn("user_family_members sync warning:", e.message);
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'সদস্যের তথ্য সফলভাবে আপডেট করা হয়েছে।'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("adminUpdateMember Error:", error);
        res.status(500).json({ success: false, message: 'সদস্য আপডেট করতে ব্যর্থ হয়েছে: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
};

// ৪. সদস্য সফট ডিলিট / ট্র্যাশ বক্স এবং মূল অ্যাডমিনের পার্মানেন্ট ডিলিট
exports.deleteMemberPermanently = async (req, res) => {
    let connection;
    try {
        const requesterId = req.user?.id || req.user?.userId;
        const { memberId } = req.params;
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [requesterCheck] = await connection.query(`SELECT id, base_role FROM users WHERE id = ?`, [requesterId]);
        if (requesterCheck.length === 0 || !['ADMIN'].includes((requesterCheck[0].base_role || '').toUpperCase())) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: 'শুধুমাত্র এডমিন সদস্য ডিলিট করতে পারবেন।' });
        }

        const [users] = await connection.query(`SELECT id, base_role FROM users WHERE id = ?`, [memberId]);
        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'সদস্য পাওয়া যায়নি।' });
        }

        if ((users[0].base_role || '').toUpperCase() === 'ADMIN' || parseInt(requesterId) === parseInt(memberId)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'এডমিন অ্যাকাউন্ট মুছে ফেলা সম্ভব নয়।' });
        }

        if (userRole === 'ADMIN' && req.query.permanent === 'true') {
            await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);
            try { await connection.query(`DELETE FROM user_family_members WHERE user_id = ?`, [memberId]); } catch (e) {}
            try { await connection.query(`DELETE FROM profile_edit_requests WHERE user_id = ?`, [memberId]); } catch (e) {}
            try { await connection.query(`DELETE FROM poll_votes WHERE user_id = ?`, [memberId]); } catch (e) {}
            try { await connection.query(`DELETE FROM committee_members WHERE user_id = ?`, [memberId]); } catch (e) {}
            try { await connection.query(`DELETE FROM users WHERE id = ?`, [memberId]); } catch (e) {}
            await connection.query(`SET FOREIGN_KEY_CHECKS = 1`);
            
            await connection.commit();
            return res.json({ success: true, message: 'সদস্যকে ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।' });
        }

        await connection.query(
            `UPDATE users SET is_deleted = 1, deleted_by = ? WHERE id = ?`,
            [requesterId, memberId]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'সদস্যকে সফলভাবে ডিলিট বক্সে পাঠানো হয়েছে।'
        });
    } catch (error) {
        if (connection) {
            try { await connection.query(`SET FOREIGN_KEY_CHECKS = 1`); } catch (e) {}
            await connection.rollback();
        }
        console.error("deleteMemberPermanently Error:", error);
        res.status(500).json({ success: false, message: 'ডিলিট করতে ব্যর্থ হয়েছে: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
};

// ৫. মূল অ্যাডমিনের জন্য ট্র্যাশ বক্সের সদস্য তালিকা দেখার এপিআই
exports.getTrashMembers = async (req, res) => {
    try {
        const [members] = await db.query(`
            SELECT u.id, u.name, u.phone, u.father_name, u.para_name, u.base_role,
                   del.name as deleted_by_name 
            FROM users u 
            LEFT JOIN users del ON u.deleted_by = del.id 
            WHERE u.is_deleted = 1 
            ORDER BY u.id DESC
        `);
        res.json({ success: true, members });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৬. ট্র্যাশ থেকে সদস্য পুনরুদ্ধার (Restore) করা
exports.restoreMember = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`UPDATE users SET is_deleted = 0, deleted_by = NULL WHERE id = ?`, [id]);
        res.json({ success: true, message: 'সদস্যকে সফলভাবে পুনরুদ্ধার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৭. অ্যাডমিন বা সাব-অ্যাডমিন কর্তৃক সরাসরি পাসওয়ার্ডসহ সদস্য যুক্ত করার এপিআই
exports.adminAddMember = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();
        
        const isPermitted = ['ADMIN', 'SUBADMIN'].includes(userRole) || req.user?.can_create === 1;
        if (!isPermitted) {
            return res.status(403).json({ success: false, message: 'আপনার সরাসরি সদস্য যুক্ত করার অনুমতি নেই।' });
        }

        const { name, phone, password, father_name, para_name, role } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ success: false, message: 'সদস্যের নাম, মোবাইল নম্বর এবং পাসওয়ার্ড বাধ্যতামূলক।' });
        }

        const [existing] = await db.query('SELECT id FROM users WHERE phone = ?', [phone.trim()]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে।' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            `INSERT INTO users (name, phone, password_hash, father_name, para_name, base_role, status, created_by, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0)`,
            [name.trim(), phone.trim(), hashedPassword, father_name?.trim() || null, para_name?.trim() || null, role || 'MEMBER', userId]
        );

        res.json({
            success: true,
            message: 'সদস্য সফলভাবে যুক্ত করা হয়েছে এবং অ্যাকাউন্ট সচল করা হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সদস্য যুক্ত করতে ব্যর্থ: ' + err.message });
    }
};