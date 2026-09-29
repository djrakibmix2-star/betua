const path = require('path');
const fs = require('fs');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

// JSON ফাইলের সঠিক পাথ ডায়নামিকভাবে খুঁজে বের করা (যেন কোনো Error না আসে)
let serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, '../../../firebase-service-account.json');
}

// ফায়ারবেস ইনিশিয়ালাইজ করা (একবারই হবে)
try {
    if (getApps().length === 0) {
        const serviceAccount = require(serviceAccountPath);
        initializeApp({
            credential: cert(serviceAccount)
        });
        console.log("🔥 Firebase Admin Initialized successfully in Notifications!");
    }
} catch (error) {
    console.error("❌ Firebase Admin Initialization Error:", error.message);
}

// সবার কাছে নোটিফিকেশন পাঠানোর কন্ট্রোলার
exports.sendToAll = async (req, res) => {
    try {
        const { title, message } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: "Title এবং Message আবশ্যক!" });
        }

        const payload = {
            notification: {
                title: title,
                body: message
            },
            topic: "all_members"
        };

        // নতুন v12+ নিয়ম অনুযায়ী মেসেজ পাঠানো
        const response = await getMessaging().send(payload);
        
        res.status(200).json({ 
            success: true, 
            message: "সফলভাবে নোটিফিকেশন পাঠানো হয়েছে!", 
            responseId: response 
        });

    } catch (error) {
        console.error("Error sending notification:", error);
        res.status(500).json({ success: false, message: "নোটিফিকেশন পাঠাতে ব্যর্থ হয়েছে।", error: error.message });
    }
};