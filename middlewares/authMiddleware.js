const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'মাফ করবেন ভাই, আগে সহিহভাবে পরিচয়পত্র (টোকেন) পেশ করুন।' 
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'আস্তাগফিরুল্লাহ! আপনার টোকেনের মেয়াদ ফুরিয়েছে অথবা ভুল টোকেন। পুনরায় লগইন করুন।' 
            });
        }
        req.user = user;
        next();
    });
};

module.exports = { verifyToken };