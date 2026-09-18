const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ১. রেজিস্ট্রেশন (পরিবারের সদস্যদের নাম ও সম্পর্কসহ - স্ট্যাটাস অবশ্যই PENDING থাকবে)
exports.register = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { name, phone, password, para_name, family_member_count, father_name, family_members, age, gender } = req.body;

        if (!name || !phone || !password) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'নাম, মোবাইল নম্বর এবং পাসওয়ার্ড দেওয়া বাধ্যতামূলক।' });
        }

        const [existing] = await connection.query('SELECT id FROM users WHERE phone = ?', [phone.trim()]);
        if (existing.length > 0) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'এই নম্বর দিয়ে ইতিমধ্যে একাউন্ট রয়েছে।' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // ফ্যামিলি মেম্বার লিস্ট ফিল্টার করা
        const membersList = Array.isArray(family_members) ? family_members.filter(m => m && typeof m === 'string' && m.trim() !== '') : [];
        const familyCount = membersList.length > 0 ? membersList.length : (parseInt(family_member_count) || 1);

        // ইউজার ইনসার্ট (স্ট্যাটাস PENDING)
        const [userResult] = await connection.query(
            `INSERT INTO users (name, father_name, phone, password_hash, para_name, family_members_count, base_role, status, age, gender)
             VALUES (?, ?, ?, ?, ?, ?, 'MEMBER', 'PENDING', ?, ?)`,
            [name.trim(), father_name ? father_name.trim() : null, phone.trim(), hashedPassword, para_name ? para_name.trim() : null, familyCount, age || 0, gender || 'MALE']
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

// ২. লগইন (ডুয়েল সাপোর্ট: ফোন বা ইমেইল এবং স্ট্যাটাস চেক)
exports.login = async (req, res) => {
    try {
        const { phone, email, identifier, password } = req.body;
        const loginId = identifier || phone || email;

        if (!loginId || !password) {
            return res.status(400).json({ success: false, message: 'লগইন তথ্য ও পাসওয়ার্ড প্রদান করুন।' });
        }

        const isEmail = loginId.includes('@');
        const query = isEmail ? 'SELECT * FROM users WHERE email = ?' : 'SELECT * FROM users WHERE phone = ?';
        
        const [rows] = await db.query(query, [loginId.trim()]);
        
        if (rows.length === 0) return res.status(400).json({ success: false, message: 'নম্বরে বা ইমেইলে কোনো একাউন্ট নেই।' });
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
        const token = jwt.sign({ id: user.id, phone: user.phone, role: role }, process.env.JWT_SECRET || 'somaj_secret_key_123', { expiresIn: '30d' });

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

// ৩. প্রোফাইল আপডেট (এডিট করলে স্ট্যাটাস স্বয়ংক্রিয়ভাবে PENDING হয়ে যাবে)
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { name, father_name, para_name, age, gender } = req.body;

        if (!name) return res.status(400).json({ success: false, message: 'নাম খালি রাখা যাবে না।' });

        // স্ট্যাটাস 'PENDING' করে দেওয়া হলো যাতে অ্যাডমিন লিস্টে দেখা যায়
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

        const count = parseInt(requested_count) || 0;
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

// ৭. ফ্যামিলি কোড দিয়ে পরিবারের সদস্যদের লিস্ট খোঁজা (সাব-রেজিস্ট্রেশনের জন্য নতুন যুক্ত)
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

// ৮. সাব-রেজিস্ট্রেশন বা প্রোফাইল ক্লেইম করা (নতুন যুক্ত)
exports.claimSubProfile = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { parent_id, member_id, phone, email, password, age, gender } = req.body;

        if (!parent_id || !member_id || !phone || !password) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'প্রয়োজনীয় তথ্য অসম্পূর্ণ।' });
        }

        const [existing] = await connection.query('SELECT id FROM users WHERE phone = ?', [phone.trim()]);
        if (existing.length > 0) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'এই মোবাইল নম্বরটি ইতিমধ্যে ব্যবহৃত হচ্ছে।' });
        }

        const [memberData] = await connection.query('SELECT member_name, age FROM user_family_members WHERE id = ? AND user_id = ?', [member_id, parent_id]);
        if (memberData.length === 0) {
            await connection.release();
            return res.status(400).json({ success: false, message: 'সদস্য খুঁজে পাওয়া যায়নি।' });
        }
        
        const member = memberData[0];
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [parentUser] = await connection.query('SELECT para_name FROM users WHERE id = ?', [parent_id]);
        const paraName = parentUser.length > 0 ? parentUser[0].para_name : null;

        const [newUser] = await connection.query(
            `INSERT INTO users (name, phone, email, password_hash, para_name, base_role, status, age, gender)
             VALUES (?, ?, ?, ?, ?, 'MEMBER', 'PENDING', ?, ?)`,
            [member.member_name, phone.trim(), email ? email.trim() : null, hashedPassword, paraName, member.age || age || 0, gender || 'MALE']
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

// ৯. নির্বাচনের জন্য সদস্য ও তার পরিবার খোঁজার লজিক (১০, ১১, ১২... প্রিফিক্স এবং শেষ ৪ ডিজিট আসল আইডি)
exports.getElectionMemberByCode = async (req, res) => {
    try {
        const { family_code } = req.body; 
        
        if (!family_code) {
            return res.status(400).json({ success: false, message: 'সদস্য কোড দিন।' });
        }

        const codeStr = family_code.toString().trim();
        
        // কোডটি অন্তত ৫ বা ৬ ডিজিটের হতে হবে (কমপক্ষে ২ ডিজিট প্রিফিক্স + ৪ ডিজিট আইডি)
        if (codeStr.length < 5) {
            return res.status(400).json({ success: false, message: 'সঠিক ফ্যামিলি কোড প্রদান করুন।' });
        }

        // শেষ ৪ ডিজিটকে আসল యూজার আইডি (realId) হিসেবে আলাদা করা
        const realIdStr = codeStr.slice(-4);
        const realId = parseInt(realIdStr, 10);

        // ১. প্রথমে মূল সদস্যকে (Head/User) users টেবিল থেকে খুঁজবো
        const [users] = await db.query('SELECT id, name as member_name, "মূল সদস্য" as relation, 0 as age FROM users WHERE id = ?', [realId]);
        
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'এই কোডের কোনো সদস্য পাওয়া যায়নি।' });
        }

        // ২. এবার তার পরিবারের অন্যান্য সদস্যদের user_family_members থেকে আনবো
        const [familyMembers] = await db.query(
            'SELECT id, member_name, relation, age FROM user_family_members WHERE user_id = ? AND status = "ACTIVE"',
            [realId]
        );

        // মূল সদস্য এবং পরিবারের বাকি সদস্যদের একসাথে যুক্ত করা
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