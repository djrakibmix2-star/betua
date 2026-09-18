const db = require('../../config/db');
const bcrypt = require('bcryptjs');

// ৮টি ফিচারের মাস্টার কনফিগারেশন (আইডি ও কী ম্যাপিং)
const DEFAULT_FEATURES = [
    { id: 1, key: 'prayer_times', name: 'ওয়াক্ত ও আজান সূচি' },
    { id: 2, key: 'notices', name: 'নোটিশ বোর্ড' },
    { id: 3, key: 'funds', name: 'মসজিদ ফান্ড' },
    { id: 4, key: 'members', name: 'সদস্য তালিকা' },
    { id: 5, key: 'committees', name: 'পরিচালনা কমিটি' },
    { id: 6, key: 'donations', name: 'দান ও সদকা' },
    { id: 7, key: 'polls', name: 'মতামত ও ভোট' },
    { id: 8, key: 'islamic_qa', name: 'দ্বীনি প্রশ্নোত্তর' }
];

// ফিচার টেবিল নাম ডিটেক্ট করার হেল্পার
async function getFeaturesList() {
    try {
        const [rows] = await db.query(`SELECT id, feature_key, feature_name FROM features ORDER BY id ASC`);
        if (rows && rows.length > 0) return rows;
    } catch (e) {
        try {
            const [sysRows] = await db.query(`SELECT id, feature_key, feature_name FROM system_features ORDER BY id ASC`);
            if (sysRows && sysRows.length > 0) return sysRows;
        } catch (err) {}
    }
    return DEFAULT_FEATURES.map(f => ({ id: f.id, feature_key: f.key, feature_name: f.name }));
}

// ১. অ্যাক্টিভ সাধারণ সদস্য তালিকা (পারমিশন স্ক্রিনের জন্য)
exports.getActiveUsers = async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT id, name, phone, 
                   father_name AS father_name, 
                   para_name AS para_name, 
                   family_members_count AS family_members_count, 
                   0 AS has_android_expert, 
                   created_at AS created_at
            FROM users 
            WHERE (status IS NULL OR UPPER(status) IN ('ACTIVE', 'APPROVED', ''))
              AND UPPER(COALESCE(base_role, '')) != 'ADMIN'
            ORDER BY name ASC
        `);

        res.json({
            success: true,
            message: 'সদস্য তালিকা সফলভাবে পাওয়া গেছে।',
            data: users,
            users: users
        });
    } catch (error) {
        console.error("getActiveUsers Error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'সদস্য তালিকা আনতে সমস্যা হয়েছে: ' + error.message,
            data: []
        });
    }
};

// ২. নির্দিষ্ট ইউজারের ৮টি ফিচারের পারমিশন ফেচ করা (অ্যাডমিনের দেখার জন্য)
exports.getUserPermissions = async (req, res) => {
    try {
        const { userId } = req.params;
        const features = await getFeaturesList();

        const [userPerms] = await db.query(
            `SELECT feature_id, can_create, can_edit, can_delete 
             FROM user_feature_permissions 
             WHERE user_id = ?`,
            [userId]
        );

        const permMap = {};
        userPerms.forEach(p => {
            permMap[p.feature_id] = {
                can_create: (p.can_create === 1 || p.can_create === true || p.can_create === '1') ? 1 : 0,
                can_edit: (p.can_edit === 1 || p.can_edit === true || p.can_edit === '1') ? 1 : 0,
                can_delete: (p.can_delete === 1 || p.can_delete === true || p.can_delete === '1') ? 1 : 0
            };
        });

        const result = features.map(f => ({
            feature_id: f.id,
            feature_key: f.feature_key,
            feature_name: f.feature_name,
            can_create: permMap[f.id] ? permMap[f.id].can_create : 0,
            can_edit: permMap[f.id] ? permMap[f.id].can_edit : 0,
            can_delete: permMap[f.id] ? permMap[f.id].can_delete : 0
        }));

        res.json({
            success: true,
            permissions: result
        });
    } catch (error) {
        console.error("getUserPermissions Error:", error);
        res.status(500).json({ success: false, message: 'পারমিশন তথ্য আনতে সমস্যা হয়েছে: ' + error.message });
    }
};

// ৩. অ্যাডমিন কর্তৃক ইউজারের পারমিশন সংরক্ষণ
exports.saveUserPermissions = async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: 'সঠিক পারমিশন তালিকা প্রদান করুন।' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(`DELETE FROM user_feature_permissions WHERE user_id = ?`, [userId]);

        for (const item of permissions) {
            const fId = item.feature_id || item.featureId;
            const cCreate = (item.can_create === 1 || item.can_create === true || item.canCreate === 1 || item.canCreate === true) ? 1 : 0;
            const cEdit = (item.can_edit === 1 || item.can_edit === true || item.canEdit === 1 || item.canEdit === true) ? 1 : 0;
            const cDelete = (item.can_delete === 1 || item.can_delete === true || item.canDelete === 1 || item.canDelete === true) ? 1 : 0;

            if (cCreate === 1 || cEdit === 1 || cDelete === 1) {
                await connection.query(
                    `INSERT INTO user_feature_permissions (user_id, feature_id, can_create, can_edit, can_delete) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [userId, fId, cCreate, cEdit, cDelete]
                );
            }
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'পারমিশন সফলভাবে সংরক্ষণ করা হয়েছে।'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("saveUserPermissions Error:", error);
        res.status(500).json({ success: false, message: 'পারমিশন সংরক্ষণ ব্যর্থ: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
};

// ৪. ইউজারের নিজস্ব সমস্ত ফিচারের পারমিশন এক কলেই বের করা
exports.getMyAllPermissions = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = (req.user?.role || req.user?.base_role || '').toUpperCase();
        const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';

        const allFeatures = await getFeaturesList();
        const permissionsMap = {};

        allFeatures.forEach(f => {
            const k = f.feature_key.toLowerCase();
            permissionsMap[k] = {
                can_create: isAdmin ? 1 : 0,
                can_edit: isAdmin ? 1 : 0,
                can_delete: isAdmin ? 1 : 0,
                canCreate: isAdmin ? 1 : 0,
                canEdit: isAdmin ? 1 : 0,
                canDelete: isAdmin ? 1 : 0
            };
        });

        if (!isAdmin && userId) {
            const [rows] = await db.query(
                `SELECT feature_id, can_create, can_edit, can_delete 
                 FROM user_feature_permissions 
                 WHERE user_id = ?`,
                [userId]
            );

            const idToKeyMap = {};
            allFeatures.forEach(f => { idToKeyMap[f.id] = f.feature_key.toLowerCase(); });

            rows.forEach(r => {
                const fKey = idToKeyMap[r.feature_id];
                if (fKey && permissionsMap[fKey]) {
                    const cCreate = (r.can_create === 1 || r.can_create === true || r.can_create === '1') ? 1 : 0;
                    const cEdit = (r.can_edit === 1 || r.can_edit === true || r.can_edit === '1') ? 1 : 0;
                    const cDelete = (r.can_delete === 1 || r.can_delete === true || r.can_delete === '1') ? 1 : 0;

                    permissionsMap[fKey] = {
                        can_create: cCreate,
                        can_edit: cEdit,
                        can_delete: cDelete,
                        canCreate: cCreate,
                        canEdit: cEdit,
                        canDelete: cDelete
                    };
                }
            });
        }

        res.json({
            success: true,
            isAdmin: isAdmin,
            permissions: permissionsMap
        });
    } catch (error) {
        console.error("getMyAllPermissions Error:", error);
        res.status(500).json({ success: false, message: 'অনুমতি তালিকা আনতে সমস্যা: ' + error.message });
    }
};

// ৫. সরাসরি নতুন সদস্য তৈরি (অ্যাডমিন প্যানেল থেকে)
exports.createDirectUser = async (req, res) => {
    try {
        const { name, phone, password, fatherName, paraName, familyMembersCount } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ success: false, message: 'নাম, মোবাইল এবং পাসওয়ার্ড আবশ্যক।' });
        }

        const [existing] = await db.query(`SELECT id FROM users WHERE phone = ?`, [phone.trim()]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'এই মোবাইল নম্বর দিয়ে ইতোমধ্যেই অ্যাকাউন্ট রয়েছে।' });
        }

        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const famCount = familyMembersCount ? parseInt(familyMembersCount) : 1;

        const [insertResult] = await db.query(`
            INSERT INTO users (name, phone, password_hash, father_name, para_name, family_members_count, base_role, status)
            VALUES (?, ?, ?, ?, ?, ?, 'MEMBER', 'ACTIVE')
        `, [name.trim(), phone.trim(), hashedPassword, fatherName || null, paraName || null, famCount]);

        res.status(201).json({
            success: true,
            message: 'নতুন সদস্য সফলভাবে তৈরি হয়েছে।',
            userId: insertResult.insertId
        });
    } catch (error) {
        console.error("createDirectUser Error:", error);
        res.status(500).json({ success: false, message: 'ইউজার তৈরি করতে সমস্যা হয়েছে: ' + error.message });
    }
};

// ৬. পেন্ডিং বা অপেক্ষমাণ ইউজারদের লিস্ট আনা (নতুন রেজিস্ট্রেশন এবং প্রোফাইল এডিট দুটোই)
exports.getPendingUsers = async (req, res) => {
    try {
        // ১. নতুন রেজিস্ট্রেশন করা পেন্ডিং ইউজারদের আনা (users টেবিল থেকে)
        const [newUsers] = await db.query(`
            SELECT id, name, phone, father_name, para_name, family_members_count, created_at, status, 
                   'NEW_REGISTRATION' AS request_type 
            FROM users 
            WHERE UPPER(status) = 'PENDING'
            ORDER BY id DESC
        `);

        // ২. প্রোফাইল এডিট রিকোয়েস্ট করা ইউজারদের আনা (profile_edit_requests টেবিল থেকে)
        // এখানে u.name, u.phone ইউজারের আসল ডেটা, আর per.requested_* গুলো হলো পরিবর্তনের আবেদন
        const [editRequests] = await db.query(`
            SELECT per.id, per.user_id, u.name, u.phone, 
                   per.requested_father_name AS father_name, 
                   per.requested_para_name AS para_name, 
                   per.requested_family_count AS family_members_count, 
                   per.created_at, per.status,
                   'PROFILE_EDIT' AS request_type
            FROM profile_edit_requests per
            JOIN users u ON per.user_id = u.id
            WHERE UPPER(per.status) = 'PENDING'
            ORDER BY per.id DESC
        `);

        // ৩. দুটো লিস্টকে একসাথে যুক্ত (Merge) করা
        const allPendingRequests = [...newUsers, ...editRequests];

        res.json({
            success: true,
            message: 'অপেক্ষমাণ সদস্য ও এডিট রিকোয়েস্টের তালিকা পাওয়া গেছে।',
            data: allPendingRequests,
            users: newUsers,
            pendingUsers: allPendingRequests, // মূল লিস্ট হিসেবে এটি ব্যবহৃত হবে
            editRequests: editRequests // আলাদাভাবে দরকার হলে ফ্রন্টএন্ড ব্যবহার করতে পারে
        });
    } catch (error) {
        console.error("getPendingUsers Error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'পেন্ডিং তালিকা আনতে সমস্যা হয়েছে: ' + error.message,
            data: [],
            users: [],
            pendingUsers: [],
            editRequests: []
        });
    }
};