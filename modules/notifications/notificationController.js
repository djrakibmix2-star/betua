const admin = require('firebase-admin');
const path = require('path');

// ফায়ারবেস ইনিশিয়ালাইজ করা (একবারই হবে)
try {
    const serviceAccount = require(path.join(__dirname, '../../../firebase-service-account.json')); // পাথ ঠিক আছে কিনা চেক করবেন
    
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🔥 Firebase Admin Initialized successfully!");
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

        const response = await admin.messaging().send(payload);
        
        res.status(200).json({ 
            success: true, 
            message: "সফলভাবে নোটিফিকেশন পাঠানো হয়েছে!", 
            responseId: response 
        });

    } catch (error) {
        console.error("Error sending notification:", error);
        res.status(500).json({ success: false, message: "নোটিফিকেশন পাঠাতে ব্যর্থ হয়েছে।", error: error.message });
    }
};