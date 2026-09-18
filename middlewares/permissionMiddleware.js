const db = require('../config/db');

// ফিচার ও অ্যাকশন ভিত্তিক পারমিশন গার্ড
const checkFeaturePermission = (featureKey, actionType = 'can_create') => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'অননুমোদিত অ্যাক্সেস! পুনরায় লগইন করুন।'
                });
            }

            // ১. আইডি ও রোল নিরাপদে বের করা (ছোট/বড় হাতের অক্ষর ও অবজেক্ট ফিল্ড হ্যান্ডলিং)
            const userId = user.id || user.userId;
            const userRole = (user.role || user.base_role || '').toUpperCase();

            // সুপার অ্যাডমিন হলে সরাসরি সব অনুমতি পাবে
            if (userRole === 'ADMIN') {
                return next();
            }

            // ২. ডেটাবেজ থেকে নির্দিষ্ট ফিচারের পারমিশন যাচাই (LOWER ব্যবহার করা হয়েছে যাতে কেইস মিসম্যাচ না হয়)
            const query = `
                SELECT ufp.can_create, ufp.can_edit, ufp.can_delete
                FROM user_feature_permissions ufp
                JOIN features f ON ufp.feature_id = f.id
                WHERE ufp.user_id = ? AND LOWER(f.feature_key) = LOWER(?)
            `;
            const [rows] = await db.query(query, [userId, featureKey]);

            // Boolean, Number বা String যাই আসুক না কেন সত্যতা যাচাই করা
            if (rows.length > 0) {
                const permissionVal = rows[0][actionType];
                const hasPermission = permissionVal === 1 || permissionVal === true || permissionVal === '1';

                if (hasPermission) {
                    return next();
                }
            }

            // অনুমতি না থাকলে বয়ান
            return res.status(403).json({
                success: false,
                message: 'মাফ করবেন ভাই! এই খাস কাজটি করার অনুমতি মহল্লার পক্ষ থেকে আপনাকে দেওয়া হয়নি।'
            });

        } catch (error) {
            console.error("checkFeaturePermission Error:", error);
            return res.status(500).json({
                success: false,
                message: 'ইন্নালিল্লাহ! অনুমতি যাচাই করতে গিয়ে ত্রুটি ঘটেছে: ' + error.message
            });
        }
    };
};

module.exports = { checkFeaturePermission };