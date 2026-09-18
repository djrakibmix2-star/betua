const db = require('../../config/db');

// ১. নতুন দান/সদকা সাবমিট করা (যেকোনো ইউজার বা মেম্বার)
exports.submitDonation = async (req, res) => {
    try {
        const { donor_name, donor_phone, donation_type, target_fund, amount, payment_method, trx_id } = req.body;

        if (!donor_name || !donor_phone || !donation_type || !target_fund || !amount || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'অনুগ্রহ করে প্রয়োজনীয় সকল তথ্য সঠিকভাবে প্রদান করুন।'
            });
        }

        let rawMethod = (payment_method || 'CASH').toString().trim();
        let methodUpper = rawMethod.toUpperCase();
        let sanitizedMethod = 'CASH';
        let requiresTrxId = false;

        // নগদ ক্যাশ বা সাধারণ ক্যাশ হলে কোনো TrxID লাগবে না
        if (methodUpper.includes('CASH') || rawMethod.includes('ক্যাশ')) {
            sanitizedMethod = 'CASH';
            requiresTrxId = false;
        } else if (methodUpper.includes('BKASH') || rawMethod.includes('বিকাশ')) {
            sanitizedMethod = 'BKASH';
            requiresTrxId = true;
        } else if (methodUpper.includes('NAGAD') || rawMethod.includes('নগদ')) {
            // যদি শুধু 'নগদ' বা মোবাইল ব্যাংকিং হয় তবেই TrxID লাগবে (নগদ ক্যাশ উপরে হ্যান্ডেল হয়েছে)
            sanitizedMethod = 'NAGAD';
            requiresTrxId = true;
        } else if (methodUpper.includes('ROCKET') || rawMethod.includes('রকেট')) {
            sanitizedMethod = 'ROCKET';
            requiresTrxId = true;
        } else if (methodUpper.includes('BANK') || rawMethod.includes('ব্যাংক')) {
            sanitizedMethod = 'BANK';
            requiresTrxId = true;
        } else {
            sanitizedMethod = 'CASH';
            requiresTrxId = false;
        }

        let finalTrxId = null;
        
        // যদি অনলাইন পেমেন্ট বা মোবাইল ওয়ালেট হয় তবেই TrxID বাধ্যতামূলক
        if (requiresTrxId) {
            finalTrxId = trx_id ? trx_id.trim().toUpperCase() : null;
            if (!finalTrxId) {
                return res.status(400).json({
                    success: false,
                    message: 'অনলাইন বা মোবাইল ওয়ালেট পেমেন্টের জন্য ট্রানজেকশন আইডি (TrxID) প্রদান করা বাধ্যতামূলক।'
                });
            }

            // একই TrxID পূর্বে ব্যবহার হয়েছে কি না তা যাচাই
            const [existingTrx] = await db.query(
                'SELECT id FROM donations WHERE trx_id = ?',
                [finalTrxId]
            );

            if (existingTrx.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'এই TrxID-টি ইতিপূর্বে ব্যবহার করা হয়েছে। অনুগ্রহ করে সঠিক TrxID দিন।'
                });
            }
        }

        await db.query(
            `INSERT INTO donations (donor_name, donor_phone, donation_type, target_fund, amount, payment_method, trx_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [
                donor_name.trim(),
                donor_phone.trim(),
                donation_type.toUpperCase(),
                target_fund.toUpperCase(),
                parseFloat(amount),
                sanitizedMethod,
                finalTrxId
            ]
        );

        res.json({
            success: true,
            message: 'জাযাকাল্লাহু খাইরান! আপনার অনুদানের তথ্য জমা হয়েছে। ক্যাশিয়ার যাচাই করে অনুমোদন করবেন।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'অনুদান সাবমিট করতে ব্যর্থ: ' + err.message
        });
    }
};

// ২. নির্দিষ্ট ফোন নম্বরের পূর্ববর্তী অনুদানের তালিকা
exports.getMyDonations = async (req, res) => {
    try {
        const { phone } = req.params;
        const [rows] = await db.query(
            'SELECT * FROM donations WHERE donor_phone = ? ORDER BY id DESC',
            [phone]
        );
        res.json({
            success: true,
            donations: rows
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'অনুদানের তথ্য পেতে ব্যর্থ: ' + err.message
        });
    }
};

// ৩. পেন্ডিং অনুদানের তালিকা (অ্যাডমিন/ক্যাশিয়ারের ভেরিফিকেশনের জন্য)
exports.getPendingDonations = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM donations WHERE status = 'PENDING' ORDER BY id DESC"
        );
        res.json({
            success: true,
            donations: rows
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'পেন্ডিং অনুদানের তালিকা লোড করা যায়নি: ' + err.message
        });
    }
};

// ৪. সকল অনুমোদিত অনুদানের তালিকা
exports.getAllApprovedDonations = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM donations WHERE status = 'APPROVED' ORDER BY id DESC LIMIT 100"
        );
        res.json({
            success: true,
            donations: rows
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'অনুমোদিত অনুদানের তালিকা পেতে ব্যর্থ: ' + err.message
        });
    }
};

// ৫. অনুদান অনুমোদন করা
exports.approveDonation = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const donationId = req.params.id;

        const [rows] = await connection.query(
            'SELECT * FROM donations WHERE id = ? FOR UPDATE',
            [donationId]
        );

        if (!rows || rows.length === 0 || rows[0].status !== 'PENDING') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'অনুমোদনযোগ্য পেন্ডিং অনুদান পাওয়া যায়নি।'
            });
        }

        const item = rows[0];

        await connection.query(
            'UPDATE donations SET status = "APPROVED", approved_by = ? WHERE id = ?',
            [req.user?.id || null, donationId]
        );

        const typeTitles = {
            'ZAKAT': 'যাকাত তহবিল',
            'SADAKAH': 'সাধারণ সদকা',
            'MOSQUE_DEV': 'মসজিদ উন্নয়ন অনুদান',
            'LILLAH': 'লিল্লাহ ফান্ড',
            'ORPHAN_AID': 'এতিম সহায়তা তহবিল'
        };
        const titleText = `${typeTitles[item.donation_type] || 'অনলাইন অনুদান'} (${item.payment_method})`;

        await connection.query(
            `INSERT INTO fund_transactions (fund_type, transaction_type, title, amount, category, payment_method, trx_id, donor_name, created_by)
             VALUES (?, 'INCOME', ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.target_fund,
                titleText,
                item.amount,
                'অনলাইন অনুদান',
                item.payment_method,
                item.trx_id,
                item.donor_name,
                req.user?.id || null
            ]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'অনুদান অনুমোদিত হয়েছে এবং মূল ফান্ড লেজারে যুক্ত হয়েছে।'
        });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({
            success: false,
            message: 'অনুমোদন ব্যর্থ হয়েছে: ' + err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

// ৬. অনুদান বাতিল / রিজেক্ট করা
exports.rejectDonation = async (req, res) => {
    try {
        const donationId = req.params.id;
        const [result] = await db.query(
            'UPDATE donations SET status = "REJECTED", approved_by = ? WHERE id = ? AND status = "PENDING"',
            [req.user?.id || null, donationId]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'পেন্ডিং অনুদান পাওয়া যায়নি বা ইতিমধ্যে প্রসেস হয়েছে।'
            });
        }

        res.json({
            success: true,
            message: 'অনুদান রেকর্ডটি বাতিল করা হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'বাতিল প্রক্রিয়া ব্যর্থ: ' + err.message
        });
    }
};