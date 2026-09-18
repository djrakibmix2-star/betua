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

// ১. সক্রিয় কমিটি সদস্যদের তালিকা ফেচ করা (এডিটরের নামসহ)
exports.getAllCommitteeMembers = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;

        const query = `
            SELECT 
                c.id,
                COALESCE(c.user_id, '') AS family_code,
                c.user_id,
                c.member_name,
                c.designation,
                c.phone,
                c.para_name,
                c.session_term,
                c.display_order,
                c.created_at,
                c.updated_at,
                u.name AS registered_user_name,
                up.name AS updated_by_name,
                up.name AS updatedByName
            FROM committee_members c
            LEFT JOIN users u ON c.user_id = u.id
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

// ২. ৫ সংখ্যার ফ্যামিলি কোড দিয়ে পরিবার ও সকল সদস্যের তথ্য অনুসন্ধান
exports.lookupFamilyByCode = async (req, res) => {
    try {
        const rawCode = req.params.code;
        if (!rawCode) {
            return res.status(400).json({
                success: false,
                message: 'ফ্যামিলি কোড প্রদান করা আবশ্যক।'
            });
        }

        let parsedNum = parseInt(rawCode);
        let possibleId = parsedNum > 10000 ? (parsedNum % 10000) : parsedNum;

        const [users] = await db.query(
            `SELECT id, name, phone, father_name, para_name 
             FROM users 
             WHERE id = ? OR phone = ? 
             LIMIT 1`,
            [possibleId, rawCode]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'এই কোডের কোনো পরিবার বা সদস্য খুঁজে পাওয়া যায়নি।'
            });
        }

        const familyHead = users[0];
        const memberList = [];

        memberList.push({
            id: familyHead.id,
            name: familyHead.name,
            phone: familyHead.phone,
            relation: 'পরিবার প্রধান'
        });

        let foundSubMembers = false;

        try {
            const [famRows] = await db.query(`
                SELECT id, 
                       COALESCE(name, member_name) AS member_name, 
                       COALESCE(relation, 'সদস্য') AS relation,
                       COALESCE(phone, '') AS phone
                FROM family_members 
                WHERE user_id = ? OR family_head_id = ? OR family_code = ?
            `, [familyHead.id, familyHead.id, rawCode]);

            if (famRows.length > 0) {
                famRows.forEach(fm => {
                    memberList.push({
                        id: fm.id,
                        name: fm.member_name,
                        phone: fm.phone || familyHead.phone,
                        relation: fm.relation || 'সদস্য'
                    });
                });
                foundSubMembers = true;
            }
        } catch (err1) {}

        if (!foundSubMembers) {
            try {
                const [memRows] = await db.query(`
                    SELECT id, 
                           COALESCE(name, member_name) AS member_name, 
                           COALESCE(relation, 'সদস্য') AS relation,
                           COALESCE(phone, '') AS phone
                    FROM members 
                    WHERE user_id = ? OR head_id = ? OR family_id = ?
                `, [familyHead.id, familyHead.id, familyHead.id]);

                if (memRows.length > 0) {
                    memRows.forEach(m => {
                        memberList.push({
                            id: m.id,
                            name: m.member_name,
                            phone: m.phone || familyHead.phone,
                            relation: m.relation || 'সদস্য'
                        });
                    });
                }
            } catch (err2) {}
        }

        return res.status(200).json({
            success: true,
            family_code: String(10000 + familyHead.id),
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

// ৩. নতুন কমিটি সদস্য যোগ করা
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
            familyCode, 
            family_code, 
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
        const finalPhone = phone;

        if (!finalName || !finalDesignation) {
            return res.status(400).json({
                success: false,
                message: 'সদস্যের নাম এবং পদবি প্রদান করা বাধ্যতামূলক।'
            });
        }

        let rawLinkedId = uId || user_id || familyCode || family_code || null;
        let linkedUserId = null;
        if (rawLinkedId) {
            let parsed = parseInt(rawLinkedId);
            if (parsed > 10000) parsed = parsed % 10000;
            linkedUserId = parsed > 0 ? parsed : null;
        }

        const pName = paraName || para_name || null;
        const sTerm = sessionTerm || session_term || '২০২৬-২০২৮';
        const dOrder = parseInt(displayOrder || display_order || 0) || 0;
        const ph = finalPhone ? String(finalPhone).trim() : '';

        let insertId = null;

        try {
            const [result] = await db.query(`
                INSERT INTO committee_members 
                    (user_id, member_name, designation, phone, para_name, session_term, display_order, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            `, [linkedUserId, finalName.trim(), finalDesignation.trim(), ph, pName, sTerm, dOrder]);
            insertId = result.insertId;
        } catch (e1) {
            const [result2] = await db.query(`
                INSERT INTO committee_members 
                    (user_id, member_name, designation, phone, para_name, session_term, display_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [linkedUserId, finalName.trim(), finalDesignation.trim(), ph, pName, sTerm, dOrder]);
            insertId = result2.insertId;
        }

        return res.status(201).json({
            success: true,
            message: 'কমিটির সদস্য সফলভাবে যুক্ত করা হয়েছে।',
            memberId: insertId
        });
    } catch (error) {
        console.error("createCommitteeMember Error:", error);
        return res.status(500).json({
            success: false,
            message: 'কমিটি সদস্য সংরক্ষণে ব্যর্থ: ' + error.message
        });
    }
};

// ৪. কমিটি সদস্যের তথ্য আপডেট করা (এডিটরের নাম ও সময় সেভ করা)
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
            familyCode, 
            family_code, 
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

        let rawLinkedId = uId || user_id || familyCode || family_code || null;
        let linkedUserId = null;
        if (rawLinkedId) {
            let parsed = parseInt(rawLinkedId);
            if (parsed > 10000) parsed = parsed % 10000;
            linkedUserId = parsed > 0 ? parsed : null;
        }

        const finalName = memberName || member_name || name;
        const finalDesignation = designation || role;
        const pName = paraName || para_name || null;
        const sTerm = sessionTerm || session_term || '২০২৬-২০২৮';
        const dOrder = displayOrder !== undefined ? parseInt(displayOrder) : (display_order !== undefined ? parseInt(display_order) : null);

        const query = `
            UPDATE committee_members 
            SET user_id = COALESCE(?, user_id), 
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

// ৫. কমিটি সদস্য সফট ডিলিট / ট্র্যাশ বক্স এবং মূল অ্যাডমিনের পার্মানেন্ট ডিলিট
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

        // যদি মূল ADMIN হয় এবং রিকোয়েস্টে permanent=true থাকে, তবে ডাটাবেজ থেকে স্থায়ীভাবে মুছে যাবে
        if (userRole === 'ADMIN' && req.query.permanent === 'true') {
            const [result] = await db.query('DELETE FROM committee_members WHERE id = ?', [id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'সদস্যের তথ্য খুঁজে পাওয়া যায়নি।' });
            }
            return res.status(200).json({ success: true, message: 'সদস্যকে ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।' });
        }

        // সফট ডিলিট (ট্র্যাশ বক্সে পাঠানো)
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

// ৬. মূল অ্যাডমিনের জন্য ট্র্যাশ বক্সের কমিটি সদস্য তালিকা দেখার এপিআই
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

// ৭. ট্র্যাশ থেকে কমিটি সদস্য পুনরুদ্ধার (Restore) করা
exports.restoreCommitteeMember = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`UPDATE committee_members SET is_deleted = 0, deleted_by = NULL WHERE id = ?`, [id]);
        res.json({ success: true, message: 'কমিটি সদস্যকে সফলভাবে পুনরুদ্ধার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};