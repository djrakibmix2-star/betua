const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('./config/db');

const app = express();

// ১. মিডলওয়্যার কনফিগারেশন
app.use(cors());
app.use(express.json());

// ২. সমস্ত রাউট মডিউল মাউন্ট করা
app.use('/api/auth', require('./modules/auth/authRoutes'));
app.use('/api/admin', require('./modules/admin/adminRoutes'));
app.use('/api/notices', require('./modules/notices/noticeRoutes'));
app.use('/api/funds', require('./modules/funds/fundRoutes'));
app.use('/api/committee', require('./modules/committee/committeeRoutes'));
app.use('/api/prayer-times', require('./modules/prayerTimes/prayerRoutes'));
app.use('/api/members', require('./modules/members/memberRoutes'));
app.use('/api/trash', require('./modules/trash/trashRoutes'));
app.use('/api/elections', require('./modules/election/electionRoutes'));

// দান ও সদকা পোর্টাল রাউট
const donationRoutes = require('./modules/donations/donationRoutes'); 
app.use('/api/donations', donationRoutes);

// প্রোফাইল ও সেটিংস রাউট
try {
    app.use('/api/profile', require('./modules/profile/profileRoutes'));
} catch (e) {
    try {
        app.use('/api/profile', require('./modules/users/userRoutes'));
    } catch (err) {
        console.warn("Profile routes not found.");
    }
}

// পোল সিস্টেম
try {
    app.use('/api/polls', require('./modules/poll/pollRoutes'));
} catch (e) {
    try {
        app.use('/api/polls', require('./modules/polls/pollRoutes'));
    } catch (err) {}
}

const islamicRoutes = require('./modules/question/islamicRoutes');
app.use('/api/islamic-qa', islamicRoutes);

// কমিটি প্রশ্নোত্তরের রাউট (একবার মাত্র রাখা হলো)
const committeeQaRoutes = require('./modules/question/committeeQaRoutes'); 
app.use('/api/committee-qa', committeeQaRoutes);

// নোটিফিকেশন রাউট
const notificationRoutes = require('./modules/notifications/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// **আপডেট রাউট (যদি আপনার ফোল্ডারের নাম update হয়)**
// যদি ফোল্ডারের নাম অন্য কিছু হয়, তবে './modules/update/updateRoutes' এর জায়গায় সঠিক পাথটি দেবেন
try {
    app.use('/api/update', require('./modules/update/updateRoutes'));
} catch (e) {
    console.warn("Update routes not found, please check the folder path.");
}

// ৩. বেসিক টেস্ট রুট
app.get('/', (req, res) => {
    res.json({ success: true, message: 'Somaj App Backend API is running successfully!' });
});

// ৪. সার্ভার স্টার্ট
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});