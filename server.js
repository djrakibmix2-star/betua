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

// দান ও সদকা পোর্টাল (যদি থাকে)
try {
    app.use('/api/donations', require('./modules/donation/donationRoutes'));
} catch (e) {
    try {
        app.use('/api/donations', require('./modules/donations/donationRoutes'));
    } catch (err) {}
}

// পোল সিস্টেম (যদি থাকে)
try {
    app.use('/api/polls', require('./modules/poll/pollRoutes'));
} catch (e) {
    try {
        app.use('/api/polls', require('./modules/polls/pollRoutes'));
    } catch (err) {}
}

const islamicRoutes = require('./modules/question/islamicRoutes');
app.use('/api/islamic-qa', islamicRoutes);


// অন্যান্য রাউটগুলোর সাথে এই রাউটটি ডিক্লেয়ার করুন
const committeeQaRoutes = require('./modules/question/committeeQaRoutes'); // আপনার ফোল্ডার পাথ অনুযায়ী মিলিয়ে নিবেন

// অ্যাপে রাউটটি রেজিস্টার করুন
app.use('/api/committee-qa', committeeQaRoutes);

// === এই লাইনটি নতুন করে যুক্ত করুন ===
// (নোট: './modules/update/updateRoutes' পাথটি আপনার ফোল্ডারের নামের সাথে মিলিয়ে নেবেন)
app.use('/api/update', require('./modules/update/updateRoutes')); 

// ৩. বেসিক টেস্ট রুট
app.get('/', (req, res) => {
    res.json({ success: true, message: 'Somaj App Backend API is running successfully!' });
});

// === এই নতুন লাইনটি যুক্ত করুন ===
app.use('/api/committee-qa', require('./modules/committeeQA/committeeQaRoutes'));

// ৪. সার্ভার স্টার্ট
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});