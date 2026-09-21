const db = require('../../config/db');

// ইউজারের কমিটি পারমিশন যাচাইয়ের হেল্পার
async function getCommitteePermissions(userId, userRole) {
    if (userRole && ['ADMIN', 'SUPERADMIN'].includes(userRole.toUpperCase())) {
        return { can_create: 1, can_edit: 1, can_delete: 1, canCreate: 1, canEdit: 1, canDelete: 1 };
    }

    if (!userId) {
        return { can_create: 0, can_edit: 0, can_delete: 0, canCreate: 0, canEdit: 0, canDelete: 0 };
    }

    try {
        const [rows] = await db.query(`
            SELECT ufp.can_create, ufp.can_edit, ufp.can_delete 
            FROM user_feature_permissions ufp
            JOIN system_features sf ON ufp.feature_id = sf.id
            WHERE ufp.user_id = ? AND sf.feature_key = 'committees'
            LIMIT 1
        `, [userId]);

        if (rows.length > 0) {
            const canC = rows[0].can_create ? 1 : 0;
            const canE = rows[0].can_edit ? 1 : 0;
            const canD = rows[0].can_delete ? 1 : 0;
            return {
                can_create: canC,
                can_edit: canE,
                can_delete: canD,
                canCreate: canC,
                canEdit: canE,
                canDelete: canD
            };
        }
    } catch (e) {
        console.warn("Committee permission lookup warning:", e.message);
    }

    return { can_create: 0, can_edit: 0, can_delete: 0, canCreate: 0, canEdit: 0, canDelete: 0 };
}

// ১. সক্রিয় কমিটি সদস্যদের তালিকা ফেচ করা (ফ্যামিলি মেম্বার ও এডিটরের নামসহ)
exports.getAllCommitteeMembers = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;

        const query = `
            SELECT 
                c.id,
                COALESCE(c.user_id, '') AS family_code,
                c.user_id,
                c.family_member_id,
                c.member_name,
                c.designation,
                c.phone,
                c.para_name,
                c.session_term,
                c.display_order,
                c.created_at,
                c.updated_at,
                u.name AS registered_user_name,
                ufm.member_name AS family_sub_member_name,
                up.name AS updated_by_name,
                up.name AS updatedByName
            FROM committee_members c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN user_family_members ufm ON c.family_member_id = ufm.id
            LEFT JOIN users up ON c.updated_by = up.id
            WHERE c.is_deleted = 0 OR c.is_deleted IS NULL
            ORDER BY c.display_order ASC, c.id ASC
        `;
        const [rows] = await db.query(query);
        const permissions = await getCommitteePermissions(userId, userRole);

        return res.status(200).json({
            success: true,
            permissions,
            members: rows
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'কমিটি তালিকা লোড করতে সমস্যা হয়েছে: ' + error.message
        });
    }
};

// ২. ফ্যামিলি কোড দিয়ে পরিবার ও সদস্যদের তথ্য অনুসন্ধান (user_family_members সাপোর্টসহ)
exports.lookupFamilyByCode = async (req, res) => {
    try {
        const rawCode = req.params.code;
        if (!rawCode) {
            return res.status(400).json({
                success: false,
                message: 'ফ্যামিলি কোড প্রদান করা আবশ্যক।'
            });
        }

        const codeStr = rawCode.toString().trim();
        let possibleId;
        // ৫ বা তার বেশি ডিজিট হলে শেষ ৪ সংখ্যা ইউজার আইডি, অন্যথায় পুরো সংখ্যাটি
        if (codeStr.length >= 5) {
            possibleId = parseInt(codeStr.slice(-4), 10);
        } else {
            possibleId = parseInt(codeStr, 10);
        }

        const [users] = await db.query(
            `SELECT id, name, phone, father_name, para_name 
             FROM users 
             WHERE id = ? OR phone = ? 
             LIMIT 1`,
            [possibleId, codeStr]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'এই কোডের কোনো পরিবার বা সদস্য খুঁজে পাওয়া যায়নি।'
            });
        }

        const familyHead = users[0];
        const memberList = [];

        // মূল সদস্য (পরিবার প্রধান)
        memberList.push({
            user_id: familyHead.id,
            family_member_id: null,
            id: familyHead.id,
            name: familyHead.name,
            phone: familyHead.phone || '',
            relation: 'পরিবার প্রধান',
            para_name: familyHead.para_name
        });

        // পরিবারের অন্যান্য সদস্যরা (user_family_members টেবিল থেকে)
        try {
            const [famRows] = await db.query(`
                SELECT id, member_name, relation, phone
                FROM user_family_members 
                WHERE user_id = ? AND status = 'ACTIVE'
            `, [familyHead.id]);

            famRows.forEach(fm => {
                memberList.push({
                    user_id: familyHead.id,
                    family_member_id: fm.id,
                    id: fm.id,
                    name: fm.member_name,
                    phone: fm.phone || familyHead.phone || '', // নিজস্ব ফোন না থাকলে বাবার ফোন
                    relation: fm.relation || 'সদস্য',
                    para_name: familyHead.para_name
                });
            });
        } catch (err) {
            console.warn("Error fetching family members:", err.message);
        }

        return res.status(200).json({
            success: true,
            family_code: codeStr,
            head_name: familyHead.name,
            phone: familyHead.phone,
            para_name: familyHead.para_name,
            members: memberList
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'পরিবার অনুসন্ধানে সমস্যা হয়েছে: ' + error.message
        });
    }
};

// ৩. নতুন কমিটি সদস্য যোগ করা (পরিবার প্রধান কিংবা পরিবারের সদস্য উভয়ই সাপোর্ট করবে)
exports.createCommitteeMember = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getCommitteePermissions(userId, userRole);

        if (permissions.can_create !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার কমিটির নতুন সদস্য যোগ করার অনুমতি নেই।'
            });
        }

        const { 
            userId: uId, 
            user_id, 
            family_member_id,
            familyMemberId,
            memberName, 
            member_name, 
            name,
            designation, 
            role,
            phone, 
            paraName, 
            para_name, 
            sessionTerm, 
            session_term, 
            displayOrder, 
            display_order 
        } = req.body;

        const finalName = memberName || member_name || name;
        const finalDesignation = designation || role;
        const finalPhone = phone ? String(phone).trim() : '';

        if (!finalName || !finalDesignation) {
            return res.status(400).json({
                success: false,
                message: 'সদস্যের নাম এবং পদবি প্রদান করা বাধ্যতামূলক।'
            });
        }

        let linkedUserId = uId || user_id || null;
        let linkedFamilyMemberId = family_member_id || familyMemberId || null;

        const pName = paraName || para_name || null;
        const sTerm = sessionTerm || session_term || '২০২৬-২০২৮';
        const dOrder = parseInt(displayOrder || display_order || 0) || 0;

        const [result] = await db.query(`
            INSERT INTO committee_members 
                (user_id, family_member_id, member_name, designation, phone, para_name, session_term, display_order, created_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `, [linkedUserId, linkedFamilyMemberId, finalName.trim(), finalDesignation.trim(), finalPhone, pName, sTerm, dOrder, userId]);

        return res.status(201).json({
            success: true,
            message: 'কমিটির সদস্য সফলভাবে যুক্ত করা হয়েছে।',
            memberId: result.insertId
        });
    } catch (error) {
        console.error("createCommitteeMember Error:", error);
        return res.status(500).json({
            success: false,
            message: 'কমিটি সদস্য সংরক্ষণে ব্যর্থ: ' + error.message
        });
    }
};

// ৪. কমিটি সদস্যের তথ্য আপডেট করা
exports.updateCommitteeMember = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getCommitteePermissions(userId, userRole);

        if (permissions.can_edit !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার কমিটির সদস্য তথ্য পরিবর্তনের অনুমতি নেই।'
            });
        }

        const { id } = req.params;
        const { 
            userId: uId, 
            user_id, 
            family_member_id,
            familyMemberId,
            memberName, 
            member_name, 
            name,
            designation, 
            role,
            phone, 
            paraName, 
            para_name, 
            sessionTerm, 
            session_term, 
            displayOrder, 
            display_order 
        } = req.body;

        const finalName = memberName || member_name || name;
        const finalDesignation = designation || role;
        const pName = paraName || para_name || null;
        const sTerm = sessionTerm || session_term || '২০২৬-২০২৮';
        const dOrder = displayOrder !== undefined ? parseInt(displayOrder) : (display_order !== undefined ? parseInt(display_order) : null);
        const linkedUserId = uId || user_id || null;
        const linkedFamilyMemberId = family_member_id || familyMemberId || null;

        const query = `
            UPDATE committee_members 
            SET user_id = COALESCE(?, user_id),
                family_member_id = COALESCE(?, family_member_id),
                member_name = COALESCE(?, member_name), 
                designation = COALESCE(?, designation), 
                phone = COALESCE(?, phone), 
                para_name = COALESCE(?, para_name), 
                session_term = COALESCE(?, session_term), 
                display_order = COALESCE(?, display_order),
                updated_by = ?,
                updated_at = NOW()
            WHERE id = ?
        `;
        const [result] = await db.query(query, [
            linkedUserId,
            linkedFamilyMemberId,
            finalName,
            finalDesignation,
            phone,
            pName,
            sTerm,
            dOrder,
            userId,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'কমিটি সদস্যের তথ্য পাওয়া যায়নি।'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'কমিটি সদস্যের তথ্য সফলভাবে হালনাগাদ হয়েছে।'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'আপডেট ব্যর্থ হয়েছে: ' + error.message
        });
    }
};

// ৫. কমিটি সদস্য সফট ডিলিট ও পার্মানেন্ট ডিলিট
exports.deleteCommitteeMember = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();
        const permissions = await getCommitteePermissions(userId, userRole);

        if (permissions.can_delete !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার কমিটি থেকে সদস্য মুছে ফেলার অনুমতি নেই।'
            });
        }

        const { id } = req.params;

        if (userRole === 'ADMIN' && req.query.permanent === 'true') {
            const [result] = await db.query('DELETE FROM committee_members WHERE id = ?', [id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'সদস্যের তথ্য খুঁজে পাওয়া যায়নি।' });
            }
            return res.status(200).json({ success: true, message: 'সদস্যকে ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।' });
        }

        const [result] = await db.query(
            'UPDATE committee_members SET is_deleted = 1, deleted_by = ? WHERE id = ?',
            [userId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'সদস্যের তথ্য খুঁজে পাওয়া যায়নি।'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'সদস্যকে সফলভাবে ডিলিট বক্সে পাঠানো হয়েছে।'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'সদস্য অপসারণে ত্রুটি: ' + error.message
        });
    }
};

// ৬. ট্র্যাশ বক্সের কমিটি সদস্য তালিকা
exports.getTrashCommitteeMembers = async (req, res) => {
    try {
        const [members] = await db.query(`
            SELECT c.*, u.name as deleted_by_name 
            FROM committee_members c 
            LEFT JOIN users u ON c.deleted_by = u.id 
            WHERE c.is_deleted = 1 
            ORDER BY c.id DESC
        `);
        res.json({ success: true, members });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৭. ট্র্যাশ থেকে কমিটি সদস্য পুনরুদ্ধার
exports.restoreCommitteeMember = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`UPDATE committee_members SET is_deleted = 0, deleted_by = NULL WHERE id = ?`, [id]);
        res.json({ success: true, message: 'কমিটি সদস্যকে সফলভাবে পুনরুদ্ধার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};