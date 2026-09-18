const db = require('../../config/db');

// ইউজারের ফান্ড পারমিশন চেক করার হেল্পার
async function getFundPermissions(userId, userRole) {
    const role = (userRole || '').toUpperCase();
    
    if (['ADMIN', 'SUPERADMIN', 'SUBADMIN'].includes(role)) {
        return {
            isAdmin: true,
            can_create: 1,
            can_edit: 1,
            can_delete: 1,
            canCreate: 1,
            canEdit: 1,
            canDelete: 1
        };
    }

    if (!userId) {
        return {
            isAdmin: false,
            can_create: 0,
            can_edit: 0,
            can_delete: 0,
            canCreate: 0,
            canEdit: 0,
            canDelete: 0
        };
    }

    try {
        const [rows] = await db.query(`
            SELECT ufp.can_create, ufp.can_edit, ufp.can_delete 
            FROM user_feature_permissions ufp
            JOIN system_features sf ON ufp.feature_id = sf.id
            WHERE ufp.user_id = ? AND sf.feature_key = 'funds'
            LIMIT 1
        `, [userId]);

        if (rows.length > 0) {
            const perm = rows[0];
            const cCreate = (perm.can_create === 1 || perm.can_create === true) ? 1 : 0;
            const cEdit = (perm.can_edit === 1 || perm.can_edit === true) ? 1 : 0;
            const cDelete = (perm.can_delete === 1 || perm.can_delete === true) ? 1 : 0;

            return {
                isAdmin: false,
                can_create: cCreate,
                can_edit: cEdit,
                can_delete: cDelete,
                canCreate: cCreate,
                canEdit: cEdit,
                canDelete: cDelete
            };
        }
    } catch (e) {
        console.warn("Fund permission lookup warning:", e.message);
    }

    return {
        isAdmin: false,
        can_create: 0,
        can_edit: 0,
        can_delete: 0,
        canCreate: 0,
        canEdit: 0,
        canDelete: 0
    };
}

// ১. মাস্টার ড্যাশবোর্ড সামারি (সক্রিয় ট্রানজাকশন ও পেন্ডিং অঙ্গীকার নিয়ে হিসাব)
exports.getDashboardSummary = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getFundPermissions(userId, userRole);

        const [transRows] = await db.query(`
            SELECT 
                fund_type,
                SUM(CASE WHEN transaction_type = 'INCOME' THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount ELSE 0 END) AS total_expense
            FROM fund_transactions
            WHERE is_deleted = 0 OR is_deleted IS NULL
            GROUP BY fund_type
        `);

        // সব পেন্ডিং অঙ্গীকারের যোগফল সরাসরি বের করা (কেস-সেন্সিটিভ সমস্যা এড়াতে UPPER ব্যবহার করা হয়েছে)
        const [pledgeRows] = await db.query(`
            SELECT 
                fund_type,
                SUM(amount) AS pending_pledge_total
            FROM fund_pledges
            WHERE UPPER(status) = 'PENDING'
            GROUP BY fund_type
        `);

        // সর্বমোট পেন্ডিং অঙ্গীকার আলাদাভাবে হিসাব করা
        const [grandPendingRows] = await db.query(`
            SELECT SUM(amount) AS grand_total_pending 
            FROM fund_pledges 
            WHERE UPPER(status) = 'PENDING'
        `);

        const summary = {
            MOSQUE: { income: 0, expense: 0, balance: 0, pendingPledge: 0 },
            MADRASAH: { income: 0, expense: 0, balance: 0, pendingPledge: 0 },
            GRAVEYARD: { income: 0, expense: 0, balance: 0, pendingPledge: 0 },
            grandTotalBalance: 0,
            grandTotalPendingPledges: parseFloat(grandPendingRows[0]?.grand_total_pending || 0)
        };

        transRows.forEach(row => {
            const fType = row.fund_type ? row.fund_type.toUpperCase() : null;
            if (fType) {
                if (!summary[fType]) {
                    summary[fType] = { income: 0, expense: 0, balance: 0, pendingPledge: 0 };
                }
                const inc = parseFloat(row.total_income) || 0;
                const exp = parseFloat(row.total_expense) || 0;
                summary[fType].income = inc;
                summary[fType].expense = exp;
                summary[fType].balance = inc - exp;
                summary.grandTotalBalance += (inc - exp);
            }
        });

        pledgeRows.forEach(row => {
            const fType = row.fund_type ? row.fund_type.toUpperCase() : null;
            if (fType) {
                if (!summary[fType]) {
                    summary[fType] = { income: 0, expense: 0, balance: 0, pendingPledge: 0 };
                }
                const pld = parseFloat(row.pending_pledge_total) || 0;
                summary[fType].pendingPledge = pld;
            }
        });

        res.json({
            success: true,
            summary,
            isAdmin: permissions.isAdmin,
            permissions: permissions
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'ড্যাশবোর্ড তথ্য লোড করা যায়নি: ' + err.message
        });
    }
};

// ২. সকল ফান্ডের সব আয়-ব্যয় লেনদেন একত্রে
exports.getAllTransactions = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getFundPermissions(userId, userRole);

        const [rows] = await db.query(`
            SELECT ft.*, 
                   u.name AS updated_by_name,
                   cu.name AS created_by_name
            FROM fund_transactions ft
            LEFT JOIN users u ON ft.updated_by = u.id
            LEFT JOIN users cu ON ft.created_by = cu.id
            WHERE ft.is_deleted = 0 OR ft.is_deleted IS NULL
            ORDER BY ft.created_at DESC, ft.id DESC
        `);

        res.json({
            success: true,
            transactions: rows,
            isAdmin: permissions.isAdmin,
            permissions: permissions
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'সকল লেনদেন পেতে ব্যর্থ: ' + err.message
        });
    }
};

// ৩. নির্দিষ্ট ফান্ডের লেনদেন
exports.getTransactionsByFund = async (req, res) => {
    try {
        const { fundType } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getFundPermissions(userId, userRole);
        
        if (fundType.toLowerCase() === 'all') {
            const [allRows] = await db.query(`
                SELECT ft.*, 
                       u.name AS updated_by_name,
                       cu.name AS created_by_name
                FROM fund_transactions ft
                LEFT JOIN users u ON ft.updated_by = u.id
                LEFT JOIN users cu ON ft.created_by = cu.id
                WHERE ft.is_deleted = 0 OR ft.is_deleted IS NULL
                ORDER BY ft.created_at DESC, ft.id DESC
            `);
            return res.json({ 
                success: true, 
                transactions: allRows,
                isAdmin: permissions.isAdmin,
                permissions: permissions
            });
        }

        const [rows] = await db.query(`
            SELECT ft.*, 
                   u.name AS updated_by_name,
                   cu.name AS created_by_name
            FROM fund_transactions ft
            LEFT JOIN users u ON ft.updated_by = u.id
            LEFT JOIN users cu ON ft.created_by = cu.id
            WHERE ft.fund_type = ? AND (ft.is_deleted = 0 OR ft.is_deleted IS NULL)
            ORDER BY ft.created_at DESC, ft.id DESC
        `, [fundType.toUpperCase()]);

        res.json({
            success: true,
            transactions: rows,
            isAdmin: permissions.isAdmin,
            permissions: permissions
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'লেনদেন তালিকা পেতে ব্যর্থ: ' + err.message
        });
    }
};

// ৪. সকল ফান্ডের সমস্ত প্রতিশ্রুতি একত্রে
exports.getAllPledges = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getFundPermissions(userId, userRole);

        const [rows] = await db.query(
            'SELECT * FROM fund_pledges ORDER BY id DESC'
        );
        res.json({
            success: true,
            pledges: rows,
            isAdmin: permissions.isAdmin,
            permissions: permissions
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'সকল প্রতিশ্রুতি লোড ব্যর্থ: ' + err.message
        });
    }
};

// ৫. নির্দিষ্ট ফান্ডের প্রতিশ্রুতি
exports.getPledgesByFund = async (req, res) => {
    try {
        const { fundType } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const permissions = await getFundPermissions(userId, userRole);

        if (fundType.toLowerCase() === 'all') {
            const [allPledges] = await db.query('SELECT * FROM fund_pledges ORDER BY id DESC');
            return res.json({ 
                success: true, 
                pledges: allPledges,
                isAdmin: permissions.isAdmin,
                permissions: permissions
            });
        }

        const [rows] = await db.query(
            'SELECT * FROM fund_pledges WHERE fund_type = ? ORDER BY id DESC',
            [fundType.toUpperCase()]
        );

        res.json({
            success: true,
            pledges: rows,
            isAdmin: permissions.isAdmin,
            permissions: permissions
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'প্রতিশ্রুতি তালিকা লোড ব্যর্থ: ' + err.message
        });
    }
};

// ৬. নতুন প্রতিশ্রুতি
exports.createPledge = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId || null;
        const { fund_type, donor_name, donor_phone, amount, purpose, target_date } = req.body;

        if (!fund_type || !donor_name || !amount) {
            return res.status(400).json({
                success: false,
                message: 'ফান্ডের নাম, দাতার নাম এবং টাকার পরিমাণ দেওয়া বাধ্যতামূলক।'
            });
        }

        const phoneToCheck = (donor_phone || '').trim();

        let pendingQuery = 'SELECT COUNT(*) AS pendingCount FROM fund_pledges WHERE UPPER(status) = "PENDING" AND ';
        let queryParams = [];

        if (userId && phoneToCheck) {
            pendingQuery += '(user_id = ? OR donor_phone = ?)';
            queryParams = [userId, phoneToCheck];
        } else if (userId) {
            pendingQuery += 'user_id = ?';
            queryParams = [userId];
        } else if (phoneToCheck) {
            pendingQuery += 'donor_phone = ?';
            queryParams = [phoneToCheck];
        } else {
            pendingQuery = null;
        }

        if (pendingQuery) {
            try {
                const [countRows] = await db.query(pendingQuery, queryParams);
                if (countRows && countRows[0] && countRows[0].pendingCount >= 5) {
                    return res.status(400).json({
                        success: false,
                        message: 'আপনার ৫টি অনুদান বা প্রতিশ্রুতির আবেদন বর্তমানে অপেক্ষমাণ রয়েছে। পূর্বের আবেদনগুলো অনুমোদন বা বাতিল না হওয়া পর্যন্ত নতুন আবেদন জমা দেওয়া যাবে না।'
                    });
                }
            } catch (err) {
                if (phoneToCheck) {
                    const [fallbackRows] = await db.query(
                        'SELECT COUNT(*) AS pendingCount FROM fund_pledges WHERE UPPER(status) = "PENDING" AND donor_phone = ?',
                        [phoneToCheck]
                    );
                    if (fallbackRows && fallbackRows[0] && fallbackRows[0].pendingCount >= 5) {
                        return res.status(400).json({
                            success: false,
                            message: 'আপনার ৫টি অনুদান বা প্রতিশ্রুতির আবেদন বর্তমানে অপেক্ষমাণ রয়েছে।'
                        });
                    }
                }
            }
        }

        try {
            await db.query(
                `INSERT INTO fund_pledges (user_id, fund_type, donor_name, donor_phone, amount, purpose, target_date, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
                [userId, fund_type.toUpperCase(), donor_name.trim(), phoneToCheck, parseFloat(amount), purpose ? purpose.trim() : '', target_date || '']
            );
        } catch (insertErr) {
            await db.query(
                `INSERT INTO fund_pledges (fund_type, donor_name, donor_phone, amount, purpose, target_date, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
                [fund_type.toUpperCase(), donor_name.trim(), phoneToCheck, parseFloat(amount), purpose ? purpose.trim() : '', target_date || '']
            );
        }

        res.json({
            success: true,
            message: 'প্রতিশ্রুতি সফলভাবে লিপিবদ্ধ হয়েছে। অ্যাডমিন অনুমোদনের পর তা কার্যকর হবে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'প্রতিশ্রুতি এন্ট্রি ব্যর্থ: ' + err.message
        });
    }
};

// ৭. প্রতিশ্রুতি অনুমোদন
exports.approvePledge = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const pledgeId = req.params.id;
        const { payment_method, trx_id } = req.body;

        const [rows] = await connection.query(
            'SELECT * FROM fund_pledges WHERE id = ? FOR UPDATE',
            [pledgeId]
        );

        if (!rows || rows.length === 0 || rows[0].status.toUpperCase() !== 'PENDING') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'অনুমোদনযোগ্য পেন্ডিং প্রতিশ্রুতি পাওয়া যায়নি।'
            });
        }

        const item = rows[0];

        await connection.query(
            'UPDATE fund_pledges SET status = "APPROVED", approved_by = ? WHERE id = ?',
            [req.user?.id || null, pledgeId]
        );

        const titleText = item.purpose ? `প্রতিশ্রুতি আদায়: ${item.purpose}` : 'প্রতিশ্রুতি আদায়';
        await connection.query(
            `INSERT INTO fund_transactions (fund_type, transaction_type, title, amount, category, payment_method, trx_id, donor_name, created_by)
             VALUES (?, 'INCOME', ?, ?, 'প্রতিশ্রুত অনুদান', ?, ?, ?, ?)`,
            [
                item.fund_type,
                titleText,
                item.amount,
                payment_method || 'CASH',
                trx_id || null,
                item.donor_name,
                req.user?.id || null
            ]
        );

        await connection.commit();
        res.json({
            success: true,
            message: 'প্রতিশ্রুতির অর্থ গ্রহণ সম্পন্ন হয়েছে এবং মূল ফান্ডে যুক্ত হয়েছে।'
        });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({
            success: false,
            message: 'অনুমোদন প্রক্রিয়া ব্যর্থ হয়েছে: ' + err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

// ৮. প্রতিশ্রুতি বাতিল
exports.cancelPledge = async (req, res) => {
    try {
        const pledgeId = req.params.id;
        const [result] = await db.query(
            'UPDATE fund_pledges SET status = "CANCELLED", approved_by = ? WHERE id = ? AND UPPER(status) = "PENDING"',
            [req.user?.id || null, pledgeId]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'পেন্ডিং প্রতিশ্রুতি পাওয়া যায়নি বা ইতিমধ্যে প্রসেস হয়েছে।'
            });
        }

        res.json({
            success: true,
            message: 'প্রতিশ্রুতিটি সফলভাবে বাতিল করা হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'বাতিল প্রক্রিয়া ব্যর্থ: ' + err.message
        });
    }
};

// ১৪. ফান্ডের অঙ্গীকার ডিলিট করার এপিআই
exports.deletePledge = async (req, res) => {
    try {
        const pledgeId = req.params.id;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;

        const perm = await getFundPermissions(userId, userRole);
        if (!perm.isAdmin && perm.can_delete !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার এই ফান্ডের অঙ্গীকার মুছে ফেলার অনুমতি নেই।'
            });
        }

        const [rows] = await db.query(
            'SELECT * FROM fund_pledges WHERE id = ?',
            [pledgeId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'উক্ত অঙ্গীকার রেকর্ডটি খুঁজে পাওয়া যায়নি।'
            });
        }

        await db.query('DELETE FROM fund_pledges WHERE id = ?', [pledgeId]);

        res.json({
            success: true,
            message: 'ফান্ডের অঙ্গীকার সফলভাবে ডিলিট করা হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'অঙ্গীকার ডিলিট করতে ব্যর্থ: ' + err.message
        });
    }
};

// ৯. সরাসরি আয়/ব্যয় ভাউচার এন্ট্রি
exports.createTransaction = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const perm = await getFundPermissions(userId, userRole);

        if (!perm.isAdmin && perm.can_create !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার ফান্ডে নতুন হিসাব এন্ট্রি করার অনুমতি নেই।'
            });
        }

        const { fund_type, transaction_type, title, amount, category, payment_method, donor_name } = req.body;

        if (!fund_type || !transaction_type || !title || !amount) {
            return res.status(400).json({
                success: false,
                message: 'প্রয়োজনীয় সকল তথ্য সঠিকভাবে প্রদান করুন।'
            });
        }

        await db.query(
            `INSERT INTO fund_transactions (fund_type, transaction_type, title, amount, category, payment_method, donor_name, created_by, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                fund_type.toUpperCase(),
                transaction_type.toUpperCase(),
                title,
                parseFloat(amount),
                category || 'সাধারণ',
                payment_method || 'CASH',
                donor_name || null,
                userId || null
            ]
        );

        res.json({
            success: true,
            message: 'হিসাব সফলভাবে সংরক্ষণ করা হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'লেনদেন সংরক্ষণ ব্যর্থ: ' + err.message
        });
    }
};

// ১০. হিসাব এডিট
exports.updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;

        const perm = await getFundPermissions(userId, userRole);
        if (!perm.isAdmin && perm.can_edit !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার ফান্ডের হিসাব সম্পাদনা করার অনুমতি নেই।'
            });
        }

        const [rows] = await db.query(
            'SELECT created_at FROM fund_transactions WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'উক্ত লেনদেন রেকর্ডটি খুঁজে পাওয়া যায়নি।'
            });
        }

        if (!perm.isAdmin) {
            const transactionTime = new Date(rows[0].created_at).getTime();
            const currentTime = Date.now();
            const differenceInHours = (currentTime - transactionTime) / (1000 * 60 * 60);

            if (differenceInHours > 24) {
                return res.status(403).json({
                    success: false,
                    message: 'নিরাপত্তার স্বার্থে ২৪ ঘণ্টা অতিক্রান্ত হওয়ার পর শুধুমাত্র অ্যাডমিন হিসাব সম্পাদনা করতে পারবেন।'
                });
            }
        }

        const { fund_type, transaction_type, title, amount, category, payment_method, donor_name } = req.body;

        await db.query(
            `UPDATE fund_transactions SET
                fund_type = COALESCE(?, fund_type),
                transaction_type = COALESCE(?, transaction_type),
                title = COALESCE(?, title),
                amount = COALESCE(?, amount),
                category = COALESCE(?, category),
                payment_method = COALESCE(?, payment_method),
                donor_name = COALESCE(?, donor_name),
                updated_by = ?,
                updated_at = NOW()
               WHERE id = ?`,
            [
                fund_type ? fund_type.toUpperCase() : null,
                transaction_type ? transaction_type.toUpperCase() : null,
                title,
                amount ? parseFloat(amount) : null,
                category,
                payment_method,
                donor_name,
                userId,
                id
            ]
        );

        res.json({
            success: true,
            message: 'হিসাব সফলভাবে হালনাগাদ করা হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'হালনাগাদ করতে ব্যর্থ: ' + err.message
        });
    }
};

// ১১. হিসাব ডিলিট
exports.deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?.userId;
        const userRole = req.user?.role || req.user?.base_role;
        const roleUpper = (userRole || '').toUpperCase();

        const perm = await getFundPermissions(userId, userRole);
        if (!perm.isAdmin && perm.can_delete !== 1) {
            return res.status(403).json({
                success: false,
                message: 'আপনার এই হিসাব মুছে ফেলার অনুমতি নেই।'
            });
        }

        const [rows] = await db.query(
            'SELECT created_at FROM fund_transactions WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'উক্ত লেনদেন রেকর্ডটি খুঁজে পাওয়া যায়নি।'
            });
        }

        if (roleUpper === 'ADMIN' && req.query.permanent === 'true') {
            await db.query('DELETE FROM fund_transactions WHERE id = ?', [id]);
            return res.json({
                success: true,
                message: 'হিসাবটি ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।'
            });
        }

        await db.query(
            'UPDATE fund_transactions SET is_deleted = 1, deleted_by = ? WHERE id = ?',
            [userId, id]
        );

        res.json({
            success: true,
            message: 'হিসাবটি সফলভাবে ডিলিট বক্সে পাঠানো হয়েছে।'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'ডিলিট করতে ব্যর্থ: ' + err.message
        });
    }
};

// ১২. ট্র্যাশ বক্সের লেনদেন
exports.getTrashTransactions = async (req, res) => {
    try {
        const [transactions] = await db.query(`
            SELECT ft.*, u.name as deleted_by_name 
            FROM fund_transactions ft 
            LEFT JOIN users u ON ft.deleted_by = u.id 
            WHERE ft.is_deleted = 1 
            ORDER BY ft.id DESC
        `);
        res.json({ success: true, transactions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ১৩. ট্র্যাশ থেকে লেনদেন পুনরুদ্ধার
exports.restoreTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`UPDATE fund_transactions SET is_deleted = 0, deleted_by = NULL WHERE id = ?`, [id]);
        res.json({ success: true, message: 'হিসাবটি সফলভাবে পুনরুদ্ধার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};