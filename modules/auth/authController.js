const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ০. সকল সক্রিয় সমাজ/মসজিদের তালিকা (পাবলিক API - লগইন ড্রপডাউনের জন্য)
exports.getActiveSocieties = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, name, branch_code, address FROM societies WHERE is_active = 1 ORDER BY id ASC"
        );
        res.json({
            success: true,
            societies: rows
        });
    } catch (err) {
        console.error("getActiveSocieties Error:", err);
        res.status(500).json({ success: false, message: 'মসজিদ/সমাজের তালিকা লোড ব্যর্থ: ' + err.message });
    }
};

// ১. রেজিস্ট্রেশন (পরিবারের সদস্যদের নাম ও সম্পর্কসহ - স্ট্যাটাস PENDING থাকবে)
exports.register = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { name, phone, password, para_name, family_member_count, father_name, family_members, age, gender, society_id } = req.body;

        if (!name || !phone || !password) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'নাম, মোবাইল নম্বর এবং পাসওয়ার্ড দেওয়া বাধ্যতামূলক।' });
        }

        const targetSocietyId = parseInt(society_id, 10) || 1;

        // নির্দিষ্ট সমাজে এই নম্বরে একাউন্ট আছে কি না চেক
        const [existing] = await connection.query('SELECT id FROM users WHERE phone = ? AND society_id = ?', [phone.trim(), targetSocietyId]);
        if (existing.length > 0) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'এই সমাজে উক্ত নম্বর দিয়ে ইতিমধ্যে একাউন্ট রয়েছে।' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // ফ্যামিলি মেম্বার লিস্ট ফিল্টার করা
        const membersList = Array.isArray(family_members) ? family_members.filter(m => m && typeof m === 'string' && m.trim() !== '') : [];
        const familyCount = membersList.length > 0 ? membersList.length : (parseInt(family_member_count) || 1);

        // ইউজার ইনসার্ট (society_id সহ)
        const [userResult] = await connection.query(
            `INSERT INTO users (name, father_name, phone, password_hash, para_name, family_members_count, base_role, status, age, gender, society_id)
             VALUES (?, ?, ?, ?, ?, ?, 'MEMBER', 'PENDING', ?, ?, ?)`,
            [name.trim(), father_name ? father_name.trim() : null, phone.trim(), hashedPassword, para_name ? para_name.trim() : null, familyCount, age || 0, gender || 'MALE', targetSocietyId]
        );

        const userId = userResult.insertId;

        // user_family_members টেবিলে মেম্বারদের নাম ইনসার্ট
        if (membersList.length > 0) {
            for (const memberName of membersList) {
                await connection.query(
                    `INSERT INTO user_family_members (user_id, member_name, relation, status) VALUES (?, ?, 'সদস্য', 'ACTIVE')`,
                    [userId, memberName.trim()]
                );
            }
        } else {
            await connection.query(
                `INSERT INTO user_family_members (user_id, member_name, relation, status) VALUES (?, ?, 'প্রধান', 'ACTIVE')`,
                [userId, name.trim()]
            );
        }

        await connection.commit();
        connection.release();

        res.json({ success: true, message: `নিবন্ধন সফল হয়েছে। আপনার ফ্যামিলি কোড (ID): ${userId}। অ্যাডমিনের অনুমোদনের পর লগইন করতে পারবেন।` });
    } catch (err) {
        await connection.rollback();
        connection.release();
        res.status(500).json({ success: false, message: 'নিবন্ধন ব্যর্থ: ' + err.message });
    }
};

// ২. লগইন (ডুয়েল সাপোর্ট: ফোন বা ইমেইল, নির্দিষ্ট সমাজ/মসজিদ এবং স্ট্যাটাস চেক)
exports.login = async (req, res) => {
    try {
        const { phone, email, identifier, password, society_id } = req.body;
        const loginId = identifier || phone || email;

        if (!loginId || !password) {
            return res.status(400).json({ success: false, message: 'লগইন তথ্য ও পাসওয়ার্ড প্রদান করুন।' });
        }

        if (!society_id) {
            return res.status(400).json({ success: false, message: 'সমাজ বা মসজিদ নির্বাচন করা আবশ্যক।' });
        }

        const isEmail = loginId.includes('@');
        const query = isEmail 
            ? 'SELECT * FROM users WHERE email = ? AND society_id = ?' 
            : 'SELECT * FROM users WHERE phone = ? AND society_id = ?';
        
        const [rows] = await db.query(query, [loginId.trim(), parseInt(society_id, 10)]);
        
        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'উক্ত সমাজে এই নম্বরে বা ইমেইলে কোনো একাউন্ট নেই।' });
        }
        const user = rows[0];

        // ইউজার স্ট্যাটাস ACTIVE না হলে লগইন ব্লক থাকবে
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'আপনার একাউন্টটি এখনও সক্রিয় নয়। অ্যাডমিনের অনুমোদনের জন্য অপেক্ষা করুন।' });
        }

        let isMatch = false;
        try { isMatch = await bcrypt.compare(password, user.password_hash); } catch (e) { isMatch = false; }
        if (!isMatch && user.password_hash === password) isMatch = true;
        if (!isMatch && user.password === password) isMatch = true;

        if (!isMatch) return res.status(400).json({ success: false, message: 'পাসওয়ার্ড সঠিক নয়।' });

        const [familyRows] = await db.query('SELECT member_name, relation FROM user_family_members WHERE user_id = ? AND status = \'ACTIVE\'', [user.id]);
        const familyMembersData = familyRows.map(row => `${row.member_name} (${row.relation})`);

        const role = user.base_role || 'MEMBER';
        // টোকেনে society_id অন্তর্ভুক্ত করা হলো
        const token = jwt.sign(
            { id: user.id, phone: user.phone, role: role, society_id: user.society_id }, 
            process.env.JWT_SECRET || 'somaj_secret_key_123', 
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: 'লগইন সফল হয়েছে।',
            token,
            user: {
                id: user.id,
                name: user.name,
                fatherName: user.father_name,
                phone: user.phone,
                email: user.email,
                role: role,
                paraName: user.para_name,
                familyCode: user.id,
                societyId: user.society_id,
                age: user.age,
                gender: user.gender,
                familyMemberCount: familyRows.length > 0 ? familyRows.length : (user.family_members_count || 1),
                familyMembers: familyMembersData
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'লগইন ত্রুটি: ' + err.message });
    }
};

// ৩. প্রোফাইল আপডেট (এডিট করলে স্ট্যাটাস স্বয়ংক্রিয়ভাবে PENDING হয়ে যাবে)
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { name, father_name, para_name, age, gender } = req.body;

        if (!name) return res.status(400).json({ success: false, message: 'নাম খালি রাখা যাবে না।' });

        await db.query(
            `UPDATE users SET name = ?, father_name = ?, para_name = ?, age = ?, gender = ?, status = 'PENDING' WHERE id = ?`,
            [
                name.trim(), 
                father_name ? father_name.trim() : null, 
                para_name ? para_name.trim() : null, 
                age || 0, 
                gender || 'MALE', 
                userId
            ]
        );

        res.json({ 
            success: true, 
            message: 'প্রোফাইল আপডেট সফল হয়েছে। অ্যাডমিনের অনুমোদনের পর পরিবর্তনগুলো কার্যকর হবে।' 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'আপডেট ব্যর্থ: ' + err.message });
    }
};

// ৪. নতুন ফ্যামিলি মেম্বার যোগ বা পরিবর্তনের রিকোয়েস্ট
exports.requestFamilyMember = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { requested_count } = req.body;

        const count = parseInt(requested_count, 10) || 0;
        if (count <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক সদস্য সংখ্যা প্রদান করুন।' });
        }

        await db.query(
            `INSERT INTO family_member_requests (user_id, requested_count, status) VALUES (?, ?, 'PENDING')`,
            [userId, count]
        );

        res.json({
            success: true,
            message: 'পরিবারের সদস্য বাড়ানোর অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'অনুরোধ ব্যর্থ: ' + err.message });
    }
};

// ৫. পাসওয়ার্ড পরিবর্তন
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { old_password, new_password } = req.body;

        const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি।' });

        let isMatch = false;
        try { isMatch = await bcrypt.compare(old_password, rows[0].password_hash); } catch (e) { isMatch = false; }
        if (!isMatch && rows[0].password_hash === old_password) isMatch = true;

        if (!isMatch) return res.status(400).json({ success: false, message: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' });

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId]);

        res.json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে।' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'পাসওয়ার্ড পরিবর্তন ব্যর্থ: ' + err.message });
    }
};

// ৬. প্রোফাইল তথ্য ও ফ্যামিলি মেম্বার লিস্ট ফেচ করা
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user?.id;

        const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ব্যবহারকারী পাওয়া যায়নি।' });
        }
        const u = rows[0];

        const [familyRows] = await db.query('SELECT member_name, relation FROM user_family_members WHERE user_id = ? AND status = \'ACTIVE\'', [userId]);
        const familyMembersData = familyRows.map(row => `${row.member_name} (${row.relation})`);

        const role = u.base_role || 'MEMBER';

        res.json({
            success: true,
            message: 'প্রোফাইল তথ্য সফলভাবে লোড হয়েছে।',
            user: {
                id: u.id,
                name: u.name,
                fatherName: u.father_name,
                phone: u.phone,
                email: u.email,
                role: role,
                paraName: u.para_name,
                familyCode: u.id,
                societyId: u.society_id,
                age: u.age,
                gender: u.gender,
                familyMemberCount: familyRows.length > 0 ? familyRows.length : (u.family_members_count || 1),
                familyMembers: familyMembersData
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'প্রোফাইল লোড ত্রুটি: ' + err.message });
    }
};

// ৭. ফ্যামিলি কোড দিয়ে পরিবারের সদস্যদের লিস্ট খোঁজা
exports.getFamilyMembersByCode = async (req, res) => {
    try {
        const { family_code } = req.body; 
        
        if (!family_code) {
            return res.status(400).json({ success: false, message: 'ফ্যামিলি কোড দিন।' });
        }

        const [parentUsers] = await db.query('SELECT id, name FROM users WHERE id = ?', [family_code]);
        if (parentUsers.length === 0) return res.status(404).json({ success: false, message: 'সঠিক ফ্যামিলি কোড পাওয়া যায়নি।' });
        
        const parentId = parentUsers[0].id;

        const [members] = await db.query(
            'SELECT id, member_name, relation, age FROM user_family_members WHERE user_id = ? AND status = "ACTIVE" AND (is_claimed = FALSE OR is_claimed IS NULL)',
            [parentId]
        );

        if (members.length === 0) return res.status(404).json({ success: false, message: 'এই ফ্যামিলিতে নতুন কোনো প্রোফাইল ক্লেইম করার বাকি নেই।' });

        res.json({ success: true, family_head: parentUsers[0].name, members, parent_id: parentId });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + err.message });
    }
};

// ৮. সাব-রেজিস্ট্রেশন বা প্রোফাইল ক্লেইম করা
exports.claimSubProfile = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { parent_id, member_id, phone, email, password, age, gender } = req.body;

        if (!parent_id || !member_id || !phone || !password) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'প্রয়োজনীয় তথ্য অসম্পূর্ণ।' });
        }

        // প্যারেন্ট ইউজারের society_id ও para_name নেওয়া
        const [parentUser] = await connection.query('SELECT para_name, society_id FROM users WHERE id = ?', [parent_id]);
        if (parentUser.length === 0) {
            await connection.release();
            return res.status(404).json({ success: false, message: 'মূল ব্যবহারকারী পাওয়া যায়নি।' });
        }
        const paraName = parentUser[0].para_name;
        const societyId = parentUser[0].society_id || 1;

        const [existing] = await connection.query('SELECT id FROM users WHERE phone = ? AND society_id = ?', [phone.trim(), societyId]);
        if (existing.length > 0) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'এই মোবাইল নম্বরটি এই সমাজে ইতিমধ্যে ব্যবহৃত হচ্ছে।' });
        }

        const [memberData] = await connection.query('SELECT member_name, age FROM user_family_members WHERE id = ? AND user_id = ?', [member_id, parent_id]);
        if (memberData.length === 0) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'সদস্য খুঁজে পাওয়া যায়নি।' });
        }
        
        const member = memberData[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await connection.query(
            `INSERT INTO users (name, phone, email, password_hash, para_name, base_role, status, age, gender, society_id)
             VALUES (?, ?, ?, ?, ?, 'MEMBER', 'PENDING', ?, ?, ?)`,
            [member.member_name, phone.trim(), email ? email.trim() : null, hashedPassword, paraName, member.age || age || 0, gender || 'MALE', societyId]
        );

        const newUserId = newUser.insertId;

        await connection.query(
            'UPDATE user_family_members SET is_claimed = TRUE, claimed_user_id = ? WHERE id = ?',
            [newUserId, member_id]
        );

        await connection.commit();
        connection.release();

        res.json({ success: true, message: 'আপনার নতুন প্রোফাইল তৈরি হয়েছে। অ্যাডমিনের অনুমোদনের পর লগইন করতে পারবেন।' });
    } catch (err) {
        await connection.rollback();
        connection.release();
        res.status(500).json({ success: false, message: 'সাব-রেজিস্ট্রেশন ব্যর্থ: ' + err.message });
    }
};

// ৯. নির্বাচনের জন্য সদস্য ও তার পরিবার খোঁজার লজিক
exports.getElectionMemberByCode = async (req, res) => {
    try {
        const { family_code } = req.body; 
        
        if (!family_code) {
            return res.status(400).json({ success: false, message: 'সদস্য কোড দিন।' });
        }

        const codeStr = family_code.toString().trim();
        if (codeStr.length < 5) {
            return res.status(400).json({ success: false, message: 'সঠিক ফ্যামিলি কোড প্রদান করুন।' });
        }

        const realIdStr = codeStr.slice(-4);
        const realId = parseInt(realIdStr, 10);

        const [users] = await db.query('SELECT id, name as member_name, "মূল সদস্য" as relation, 0 as age FROM users WHERE id = ?', [realId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'এই কোডের কোনো সদস্য পাওয়া যায়নি।' });
        }

        const [familyMembers] = await db.query(
            'SELECT id, member_name, relation, age FROM user_family_members WHERE user_id = ? AND status = "ACTIVE"',
            [realId]
        );

        const allMembers = [...users, ...familyMembers];

        res.json({ 
            success: true, 
            message: "সদস্য পাওয়া গেছে", 
            members: allMembers 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + err.message });
    } 
};

// ১০. কমিটির জন্য মেম্বার কোড দিয়ে ইউজার ও তার পরিবারের সদস্যদের সার্চ করা
exports.getCommitteeMemberByCode = async (req, res) => {
    try {
        const { member_code } = req.body;

        if (!member_code) {
            return res.status(400).json({ success: false, message: 'সদস্য কোড প্রদান করুন।' });
        }

        const codeStr = member_code.toString().trim();
        let targetUserId;
        if (codeStr.length >= 5) {
            targetUserId = parseInt(codeStr.slice(-4), 10);
        } else {
            targetUserId = parseInt(codeStr, 10);
        }

        const [users] = await db.query(
            `SELECT id as user_id, NULL as family_member_id, name, phone, para_name, 'পরিবার প্রধান' as relation 
             FROM users WHERE id = ?`, 
            [targetUserId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'এই কোডের কোনো সদস্য খুঁজে পাওয়া যায়নি।' });
        }

        const headUser = users[0];

        const [familyRows] = await db.query(
            `SELECT id as family_member_id, member_name as name, relation, phone 
             FROM user_family_members 
             WHERE user_id = ? AND status = 'ACTIVE'`,
            [targetUserId]
        );

        const familyFormatted = familyRows.map(member => ({
            user_id: headUser.user_id,
            family_member_id: member.family_member_id,
            name: member.name,
            phone: member.phone || headUser.phone,
            para_name: headUser.para_name,
            relation: member.relation || 'সদস্য'
        }));

        const eligibleMembers = [headUser, ...familyFormatted];

        res.json({
            success: true,
            message: 'সদস্য তথ্য সফলভাবে পাওয়া গেছে।',
            family_code: codeStr,
            members: eligibleMembers
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + err.message });
    }
};