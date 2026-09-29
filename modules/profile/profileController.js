const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

// __dirname ব্যবহার করে সঠিক পাথ সেট করা হলো
const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

if (getApps().length === 0) {
    try {
        const serviceAccount = require(serviceAccountPath);
        initializeApp({
            credential: cert(serviceAccount),
            storageBucket: 'somaj10.appspot.com' 
        });
    } catch (error) {
        console.error("Firebase Admin Error in Profile:", error.message);
    }
}
const bucket = getStorage().bucket();

// ১. ইউজারের প্রোফাইল তথ্য এবং বর্তমান ফ্যামিলি মেম্বারদের তালিকা দেখা
exports.getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        // 👈 এখানে society_id AS member_id করে দেওয়া হয়েছে
        const [users] = await db.query(
            `SELECT id, society_id AS member_id, name, father_name, para_name, gender, age, family_members_count, 
                    has_android_expert, phone, avatar_url, base_role, status 
             FROM users WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, 
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: "ব্যবহারকারী পাওয়া যায়নি।" });
        }

        const user = users[0];

        const [familyMembers] = await db.query(
            `SELECT id, member_name, relation, age, gender, status FROM user_family_members WHERE user_id = ?`,
            [userId]
        );
        user.family_members = familyMembers;

        const [pendingRequests] = await db.query(
            `SELECT * FROM profile_edit_requests 
             WHERE user_id = ? AND UPPER(status) = 'PENDING' AND (is_deleted = 0 OR is_deleted IS NULL) 
             ORDER BY id DESC LIMIT 1`,
            [userId]
        );

        let pendingData = null;
        if (pendingRequests.length > 0) {
            pendingData = pendingRequests[0];
            if (typeof pendingData.requested_family_members === 'string') {
                try {
                    pendingData.requested_family_members = JSON.parse(pendingData.requested_family_members);
                } catch (e) {
                    pendingData.requested_family_members = [];
                }
            }
        }

        res.json({
            success: true,
            user: user,
            hasPendingEditRequest: pendingRequests.length > 0,
            pendingRequestData: pendingData
        });
    } catch (error) {
        console.error("getMyProfile Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message });
    }
};

// ২. সাধারণ সদস্যের প্রোফাইল ও সদস্য তথ্য পরিবর্তনের আবেদন
exports.requestProfileEdit = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = (req.user.role || req.user.base_role || '').toUpperCase();
        const { father_name, para_name, gender, age, family_members } = req.body;

        if (userRole === 'ADMIN' || userRole === 'SUPERADMIN') {
            return res.status(400).json({
                success: false,
                message: "অ্যাডমিনের জন্য পারিবারিক তথ্য এডিটের প্রয়োজন নেই।"
            });
        }

        const [existing] = await db.query(
            `SELECT id FROM profile_edit_requests 
             WHERE user_id = ? AND UPPER(status) = 'PENDING' AND (is_deleted = 0 OR is_deleted IS NULL)`,
            [userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "আপনার একটি পরিবর্তনের আবেদন ইতিমধ্যে অপেক্ষমাণ রয়েছে।"
            });
        }

        const membersList = Array.isArray(family_members) ? family_members : [];
        const count = membersList.length;
        const membersJson = JSON.stringify(membersList);

        await db.query(
            `INSERT INTO profile_edit_requests 
             (user_id, requested_father_name, requested_para_name, requested_gender, requested_age, requested_family_members, requested_family_count, is_deleted) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [userId, father_name || null, para_name || null, gender || null, age || null, membersJson, count]
        );

        res.json({
            success: true,
            message: "প্রোফাইল ও সদস্য তথ্য পরিবর্তনের আবেদনটি জমা হয়েছে। অ্যাডমিন অনুমোদন দিলে আপডেট হবে।"
        });
    } catch (error) {
        console.error("requestProfileEdit Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message });
    }
};

// ৩. পাসওয়ার্ড পরিবর্তন মেথড
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "বর্তমান ও নতুন উভয় পাসওয়ার্ড প্রদান করুন।"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।"
            });
        }

        const [users] = await db.query(`SELECT password_hash FROM users WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: "ইউজার পাওয়া যায়নি।" });
        }

        const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "বর্তমান পাসওয়ার্ডটি ভুল।"
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashedPassword, userId]);

        res.json({
            success: true,
            message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।"
        });
    } catch (error) {
        console.error("changePassword Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message });
    }
};

// ৪. (অ্যাডমিন) সকল পেন্ডিং আবেদন দেখা
exports.getAllPendingRequests = async (req, res) => {
    try {
        const [pendingUsers] = await db.query(
            `SELECT id as request_id, id as user_id, name as user_name, phone as user_phone, 
                    father_name as requested_father_name, para_name as requested_para_name, 
                    gender as requested_gender, age as requested_age,
                    family_members_count as requested_family_count, 'REGISTRATION' as request_type,
                    created_at 
             FROM users 
             WHERE UPPER(status) = 'PENDING' AND (is_deleted = 0 OR is_deleted IS NULL) 
             ORDER BY created_at DESC`
        );

        for (let u of pendingUsers) {
            const [members] = await db.query(
                `SELECT id, member_name, relation, age, gender FROM user_family_members WHERE user_id = ?`,
                [u.user_id]
            );
            u.requested_family_members = members;
            u.current_father_name = null;
            u.current_para_name = null;
            u.current_gender = null;
            u.current_age = null;
            u.current_family_count = 0;
            u.current_family_members = [];
        }

        const [editRequests] = await db.query(
            `SELECT r.id as request_id, r.user_id, 
                    u.name as user_name, u.phone as user_phone, 
                    u.father_name as current_father_name, 
                    u.para_name as current_para_name, 
                    u.gender as current_gender,
                    u.age as current_age,
                    u.family_members_count as current_family_count,
                    r.requested_father_name, r.requested_para_name, 
                    r.requested_gender, r.requested_age,
                    r.requested_family_members, r.requested_family_count, 
                    'PROFILE_EDIT' as request_type,
                    r.created_at
             FROM profile_edit_requests r
             JOIN users u ON r.user_id = u.id
             WHERE UPPER(r.status) = 'PENDING' AND (r.is_deleted = 0 OR r.is_deleted IS NULL) AND (u.is_deleted = 0 OR u.is_deleted IS NULL)
             ORDER BY r.created_at DESC`
        );

        for (let r of editRequests) {
            const [currentMembers] = await db.query(
                `SELECT id, member_name, relation, age, gender FROM user_family_members WHERE user_id = ?`,
                [r.user_id]
            );
            r.current_family_members = currentMembers;

            if (typeof r.requested_family_members === 'string') {
                try {
                    r.requested_family_members = JSON.parse(r.requested_family_members);
                } catch (e) {
                    r.requested_family_members = [];
                }
            } else if (!r.requested_family_members) {
                r.requested_family_members = [];
            }
        }

        const allRequests = [...pendingUsers, ...editRequests];
        res.json({ 
            success: true, 
            requests: allRequests,
            data: allRequests 
        });
    } catch (error) {
        console.error("getAllPendingRequests Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message, requests: [], data: [] });
    }
};

// ৫. অ্যাডমিন কর্তৃক অনুমোদন
exports.approveRequest = async (req, res) => {
    const requestId = req.params.requestId || req.params.id;
    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [editRequests] = await connection.query(
            `SELECT * FROM profile_edit_requests 
             WHERE (id = ? OR user_id = ?) AND UPPER(status) = 'PENDING' 
             ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [requestId, requestId]
        );

        if (editRequests.length > 0) {
            const request = editRequests[0];
            let newMembers = [];
            
            if (request.requested_family_members) {
                try {
                    newMembers = typeof request.requested_family_members === 'string' 
                        ? JSON.parse(request.requested_family_members) 
                        : request.requested_family_members;
                } catch (e) {
                    newMembers = [];
                }
            }

            const newCount = newMembers.length > 0 ? newMembers.length : request.requested_family_count;

            await connection.query(
                `UPDATE users SET 
                 father_name = COALESCE(?, father_name),
                 para_name = COALESCE(?, para_name),
                 gender = COALESCE(?, gender),
                 age = COALESCE(?, age),
                 family_members_count = COALESCE(?, family_members_count)
                 WHERE id = ?`,
                [request.requested_father_name, request.requested_para_name, request.requested_gender, request.requested_age, newCount, request.user_id]
            );

            if (newMembers.length > 0) {
                await connection.query(`DELETE FROM user_family_members WHERE user_id = ?`, [request.user_id]);

                const memberInsertPromises = newMembers.map(m => {
                    const memberName = m.member_name || m.memberName || '';
                    const relation = m.relation || 'সদস্য';
                    const age = (m.age !== undefined && m.age !== null && m.age !== '') ? parseInt(m.age, 10) : null;
                    const gender = m.gender || null;

                    return connection.query(
                        `INSERT INTO user_family_members (user_id, member_name, relation, age, gender, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
                        [request.user_id, memberName, relation, isNaN(age) ? null : age, gender]
                    );
                });
                await Promise.all(memberInsertPromises);
            }

            await connection.query(
                `UPDATE profile_edit_requests SET status = 'APPROVED' WHERE id = ?`,
                [request.id]
            );

            await connection.commit();
            return res.json({ 
                success: true, 
                message: "প্রোফাইল পরিবর্তনের আবেদনটি সফলভাবে অনুমোদন ও আপডেট করা হয়েছে।" 
            });
        }

        const [userCheck] = await connection.query(
            `SELECT * FROM users WHERE id = ? AND UPPER(status) = 'PENDING' FOR UPDATE`,
            [requestId]
        );

        if (userCheck.length > 0) {
            await connection.query(
                `UPDATE users SET status = 'ACTIVE' WHERE id = ?`,
                [requestId]
            );
            await connection.commit();
            return res.json({ 
                success: true, 
                message: "নতুন ইউজারের অ্যাকাউন্ট সফলভাবে সক্রিয় (Active) করা হয়েছে।" 
            });
        }

        await connection.rollback();
        return res.status(404).json({ success: false, message: "কোনো পেন্ডিং আবেদন পাওয়া যায়নি।" });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("approveRequest Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message });
    } finally {
        if (connection) connection.release();
    }
};

// ৬. (অ্যাডমিন) আবেদন বাতিল বা রিজেক্ট করা
exports.rejectRequest = async (req, res) => {
    const requestId = req.params.requestId || req.params.id;
    const { note } = req.body || {};

    try {
        const [editResult] = await db.query(
            `UPDATE profile_edit_requests SET status = 'REJECTED', admin_note = ? 
             WHERE id = ? AND UPPER(status) = 'PENDING'`,
            [note || null, requestId]
        );

        if (editResult.affectedRows > 0) {
            return res.json({ 
                success: true, 
                message: "প্রোফাইল পরিবর্তনের আবেদনটি সফলভাবে বাতিল করা হয়েছে।" 
            });
        }

        const [userResult] = await db.query(
            `UPDATE users SET status = 'REJECTED' 
             WHERE id = ? AND UPPER(status) = 'PENDING'`,
            [requestId]
        );

        if (userResult.affectedRows > 0) {
            return res.json({ 
                success: true, 
                message: "নতুন ইউজারের রেজিস্ট্রেশন সফলভাবে বাতিল করা হয়েছে।" 
            });
        }

        return res.status(404).json({ 
            success: false, 
            message: "আবেদনটি পাওয়া যায়নি অথবা ইতিমধ্যে প্রসেস করা হয়েছে।" 
        });

    } catch (error) {
        console.error("rejectRequest Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message });
    }
};

// ৭. ছবি আপলোড ও ফায়ারবেসে সংরক্ষণ
exports.uploadAvatar = async (req, res) => {
    try {
        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "কোনো ছবি সিলেক্ট করা হয়নি!" });
        }

        const filename = `avatars/user_${userId}_${Date.now()}_${file.originalname.replace(/ /g, "_")}`;
        const fileUpload = bucket.file(filename);

        const stream = fileUpload.createWriteStream({
            metadata: { contentType: file.mimetype }
        });

        stream.on('error', (error) => {
            console.error("Firebase upload error:", error);
            return res.status(500).json({ success: false, message: "ছবি আপলোডে সমস্যা হয়েছে।" });
        });

        stream.on('finish', async () => {
            await fileUpload.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

            await db.query(`UPDATE users SET avatar_url = ? WHERE id = ?`, [publicUrl, userId]);

            res.json({
                success: true,
                message: "প্রোফাইল পিকচার সফলভাবে আপডেট হয়েছে!",
                avatar_url: publicUrl
            });
        });

        stream.end(file.buffer);
    } catch (error) {
        console.error("uploadAvatar Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা: " + error.message });
    }
};