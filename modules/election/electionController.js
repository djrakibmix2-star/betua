const db = require('../../config/db');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// হেল্পার ফাংশন: ছবি কম্প্রেস করার জন্য (উইন্ডোজ সেফ)
async function compressAndSaveImage(file) {
    if (!file) return null;
    try {
        const compressedFilename = 'compressed-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.jpg';
        const compressedPath = path.join('uploads', compressedFilename);
        
        // Sharp দিয়ে ছবির সাইজ রিসাইজ (সর্বোচ্চ ৮০০x৮০০) এবং কোয়ালিটি ৮০% করা হলো
        await sharp(file.path)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(compressedPath);
        
        // উইন্ডোজের EPERM লক বা পারমিশন এরর এড়াতে unlink আলাদা try-catch এ রাখা হলো
        try {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (unlinkError) {
            console.log('Temp file delete warning (ignored):', unlinkError.message);
        }
        
        return compressedPath.replace(/\\/g, '/'); // পাথ নরমালাইজ করা
    } catch (error) {
        console.error('Image compression error:', error);
        // কম্প্রেস করতে ব্যর্থ হলে মূল ফাইলটিই রিটার্ন করবে
        return file.path ? file.path.replace(/\\/g, '/') : null;
    }
}

// ১. নতুন নির্বাচন তৈরি (অ্যাডমিন)
exports.createElection = async (req, res) => {
    const { title, description, application_deadline, eligible_gender, min_age, positions } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const formattedDeadline = application_deadline 
            ? application_deadline.replace('Z', '').replace('T', ' ') 
            : null;

        const [result] = await connection.query(
            'INSERT INTO elections (title, description, application_deadline, eligible_gender, min_age, status) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, formattedDeadline, eligible_gender || 'ALL', min_age || 18, 'REGISTRATION']
        );
        const electionId = result.insertId;

        if (positions && positions.length > 0) {
            const positionValues = positions.map(p => [electionId, p]);
            await connection.query(
                'INSERT INTO election_positions (election_id, position_name) VALUES ?',
                [positionValues]
            );
        }
        await connection.commit();
        res.json({ success: true, message: 'নির্বাচন সফলভাবে তৈরি হয়েছে।' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ২. ভোট গ্রহণ শুরু করা
exports.startVoting = async (req, res) => {
    try {
        await db.query("UPDATE elections SET status = 'VOTING_STARTED' WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'ভোট গ্রহণ শুরু হয়েছে!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৩. নির্বাচন সমাপ্ত ঘোষণা করা
exports.closeElection = async (req, res) => {
    try {
        await db.query("UPDATE elections SET status = 'CLOSED' WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'নির্বাচন সমাপ্ত ঘোষণা করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৪. সকল নির্বাচন দেখা
exports.getAllElections = async (req, res) => {
    try {
        const [elections] = await db.query('SELECT * FROM elections ORDER BY created_at DESC');
        res.json({ success: true, elections: elections || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৫. নির্বাচনের বিস্তারিত, পজিশন ও প্রার্থী তালিকা দেখা
exports.getElectionDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const [electionInfo] = await db.query('SELECT * FROM elections WHERE id = ?', [id]);
        if (electionInfo.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি' });

        const [positions] = await db.query('SELECT * FROM election_positions WHERE election_id = ?', [id]);
        const [candidates] = await db.query('SELECT * FROM candidates WHERE election_id = ?', [id]);

        res.json({ 
            success: true, 
            election: electionInfo[0], 
            positions: positions || [], 
            candidates: candidates || [] 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৬. প্রার্থী হওয়ার আবেদন (ফ্যামিলি মেম্বার সাপোর্ট সহ)
exports.applyForCandidacy = async (req, res) => {
    // এখানে family_member_id নতুন করে রিসিভ করা হচ্ছে
    const { election_id, position_id, member_id, family_member_id, symbol_name, custom_photo, symbol_photo_url, reason, manifesto } = req.body;
    
    const rawCandidatePhoto = req.files && req.files['candidate_photo'] ? req.files['candidate_photo'][0] : null;
    const rawSymbolPhoto = req.files && req.files['symbol_photo'] ? req.files['symbol_photo'][0] : null;

    const candidatePhoto = rawCandidatePhoto ? await compressAndSaveImage(rawCandidatePhoto) : (custom_photo || null);
    const symbolPhoto = rawSymbolPhoto ? await compressAndSaveImage(rawSymbolPhoto) : (symbol_photo_url || null);

    try {
        // ১. নির্বাচন স্ট্যাটাস ও ডেডলাইন চেক
        const [election] = await db.query('SELECT status, application_deadline, eligible_gender, min_age FROM elections WHERE id = ?', [election_id]);
        if (election.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি।' });

        if (election[0].status !== 'REGISTRATION') {
            return res.status(400).json({ success: false, message: 'এই নির্বাচনে এখন আর নতুন প্রার্থী যুক্ত হওয়ার সুযোগ নেই।' });
        }

        const now = new Date();
        const deadline = new Date(election[0].application_deadline);
        if (now > deadline) {
            return res.status(400).json({ success: false, message: 'আবেদনের সময়সীমা পার হয়ে গেছে।' });
        }

        // ২. ডাবল আবেদন চেক
        // যদি family_member_id থাকে, তবে ওই সদস্য আগে আবেদন করেছে কি না চেক করবে। না থাকলে মূল member_id চেক করবে।
        let existingQuery = 'SELECT id FROM candidates WHERE election_id = ? AND ';
        let existingParams = [election_id];
        
        if (family_member_id && family_member_id !== 'null' && family_member_id !== '0') {
            existingQuery += 'family_member_id = ?';
            existingParams.push(family_member_id);
        } else {
            existingQuery += 'member_id = ? AND family_member_id IS NULL';
            existingParams.push(member_id);
        }

        const [existingCandidate] = await db.query(existingQuery, existingParams);
        if (existingCandidate.length > 0) {
            return res.status(400).json({ success: false, message: 'দুঃখিত, এই সদস্য ইতিমধ্যে একজন প্রার্থী হিসেবে আবেদন করেছেন!' });
        }

        // ৩. প্রার্থীর নাম, বয়স ও জেন্ডার অটোমেটিক ফেচ করা
        let candidate_name = "";
        let candidate_age = 0;
        let userGender = "";

        if (family_member_id && family_member_id !== 'null' && family_member_id !== '0') {
            // পরিবারের সদস্য হলে 'family_members' টেবিল থেকে ডাটা নেবে (আপনার টেবিলের নাম যদি ভিন্ন হয়, যেমন 'members', তাহলে এখানে পরিবর্তন করে নেবেন)
            const [famInfo] = await db.query('SELECT member_name AS name, gender, age FROM family_members WHERE id = ?', [family_member_id]);
            if (famInfo.length === 0) return res.status(404).json({ success: false, message: 'পরিবারের সদস্যের তথ্য পাওয়া যায়নি।' });
            
            candidate_name = famInfo[0].name;
            candidate_age = famInfo[0].age;
            userGender = famInfo[0].gender;
        } else {
            // পরিবারের সদস্য সিলেক্ট না করলে মূল ইউজার (পরিবার প্রধান) এর ডাটা নেবে
            const [userInfo] = await db.query('SELECT name, gender, age FROM users WHERE id = ?', [member_id]);
            if (userInfo.length === 0) return res.status(404).json({ success: false, message: 'ইউজারের তথ্য পাওয়া যায়নি।' });
            
            candidate_name = userInfo[0].name;
            candidate_age = userInfo[0].age;
            userGender = userInfo[0].gender;
        }

        // ৪. জেন্ডার ও বয়স ভ্যালিডেশন
        if (election[0].eligible_gender !== 'ALL' && election[0].eligible_gender !== userGender) {
            return res.status(400).json({ success: false, message: 'এই প্রার্থীর জেন্ডার এই নির্বাচনের উপযোগী নয়।' });
        }

        const minAge = election[0].min_age || 18;
        if (candidate_age < minAge) {
            return res.status(400).json({ success: false, message: `বয়স কমপক্ষে ${minAge} বছর হতে হবে। প্রার্থীর বর্তমান বয়স ${candidate_age} বছর।` });
        }

        // ৫. ডাটাবেসে সেভ করা (status ডিফল্ট APPROVED রাখা হলো আপনার আগের কোড অনুযায়ী)
        const finalFamilyMemberId = (family_member_id && family_member_id !== 'null' && family_member_id !== '0') ? family_member_id : null;

        await db.query(
            `INSERT INTO candidates (election_id, position_id, member_id, family_member_id, candidate_name, candidate_age, candidate_photo, symbol_name, symbol_photo, reason, manifesto, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')`,
            [election_id, position_id, member_id, finalFamilyMemberId, candidate_name, candidate_age, candidatePhoto, symbol_name || null, symbolPhoto, reason || "সেবা করার উদ্দেশ্যে", manifesto || "সততা ও নিষ্ঠা"]
        );

        res.json({ success: true, message: 'প্রার্থীতার আবেদন সফলভাবে জমা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// ৭. প্রার্থীতা প্রত্যাহার
exports.withdrawCandidacy = async (req, res) => {
    const { electionId, candidateId, memberId } = req.params;
    try {
        const [election] = await db.query('SELECT status FROM elections WHERE id = ?', [electionId]);
        if (election.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি।' });

        if (election[0].status !== 'REGISTRATION') {
            return res.status(400).json({ success: false, message: 'ভোট গ্রহণ শুরু হয়ে যাওয়ায় এখন প্রত্যাহার সম্ভব নয়।' });
        }

        await db.query('DELETE FROM candidates WHERE id = ? AND member_id = ?', [candidateId, memberId]);
        res.json({ success: true, message: 'প্রার্থীতা সফলভাবে প্রত্যাহার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ভোট প্রদান (ডাবল ভোট চেক সহ)
exports.castVote = async (req, res) => {
    const { election_id, position_id, candidate_id, voter_id } = req.body;
    try {
        const [election] = await db.query('SELECT status, eligible_gender, min_age FROM elections WHERE id = ?', [election_id]);
        if (election.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি।' });

        if (election[0].status !== 'VOTING_STARTED') {
            return res.status(400).json({ success: false, message: 'বর্তমানে এই নির্বাচনের ভোটগ্রহণ চলছে না।' });
        }

        const [voterInfo] = await db.query('SELECT gender, age FROM users WHERE id = ?', [voter_id]);
        if (voterInfo.length === 0) return res.status(404).json({ success: false, message: 'ভোটারের তথ্য পাওয়া যায়নি।' });

        // জেন্ডার ও বয়স চেক
        if (election[0].eligible_gender !== 'ALL' && election[0].eligible_gender !== voterInfo[0].gender) {
            return res.status(400).json({ success: false, message: 'আপনার জেন্ডার এই নির্বাচনে ভোট দেওয়ার উপযোগী নয়।' });
        }

        // ডাবল ভোট চেক (এই পদে ইউজার ইতিমধ্যে ভোট দিয়েছে কি না)
        const [existing] = await db.query(
            'SELECT id FROM votes WHERE election_id = ? AND position_id = ? AND voter_id = ?', 
            [election_id, position_id, voter_id]
        );
        
        if (existing.length > 0) {
             return res.status(400).json({ success: false, message: 'আপনি ইতিমধ্যে এই পদে ভোট দিয়েছেন!' });
        }

        await db.query(
            'INSERT INTO votes (election_id, position_id, candidate_id, voter_id) VALUES (?, ?, ?, ?)',
            [election_id, position_id, candidate_id, voter_id]
        );

        res.json({ success: true, message: 'আপনার ভোট সফলভাবে গ্রহণ করা হয়েছে!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৯. ফলাফল ও ড্যাশবোর্ড
exports.getElectionResults = async (req, res) => {
    try {
        const { id } = req.params;

        const [electionInfo] = await db.query('SELECT status, eligible_gender FROM elections WHERE id = ?', [id]);
        if (electionInfo.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি।' });
        
        const electionStatus = electionInfo[0].status;
        const eligibleGender = electionInfo[0].eligible_gender;

        let userQuery = 'SELECT COUNT(id) AS total_users FROM users';
        let userParams = [];
        if (eligibleGender !== 'ALL') {
            userQuery += ' WHERE gender = ?';
            userParams.push(eligibleGender);
        }
        const [userCount] = await db.query(userQuery, userParams);
        const totalEligibleVoters = userCount[0].total_users || 0;

        const [castCount] = await db.query('SELECT COUNT(DISTINCT voter_id) AS total_cast FROM votes WHERE election_id = ?', [id]);
        const totalCastVotes = castCount[0].total_cast || 0;
        
        const remainingVotes = Math.max(0, totalEligibleVoters - totalCastVotes);

        const [sqlResults] = await db.query(`
            SELECT 
                c.id AS candidate_id,
                c.candidate_name,
                c.symbol_name,
                c.candidate_photo AS photo_url,
                c.symbol_photo AS symbol_photo_url,
                c.position_id,
                ep.position_name,
                COUNT(v.id) AS vote_count
            FROM candidates c
            JOIN election_positions ep ON c.position_id = ep.id
            LEFT JOIN votes v ON c.id = v.candidate_id
            WHERE c.election_id = ?
            GROUP BY c.id
            ORDER BY c.position_id, vote_count DESC
        `, [id]);

        const [familyVotes] = await db.query(`
            SELECT v.candidate_id, u.family_id, COUNT(v.id) AS vote_count
            FROM votes v
            JOIN users u ON v.voter_id = u.id
            WHERE v.election_id = ?
            GROUP BY v.candidate_id, u.family_id
        `, [id]);

        const grouped = {};
        sqlResults.forEach(row => {
            if (!grouped[row.position_id]) {
                grouped[row.position_id] = {
                    position_id: row.position_id,
                    position_name: row.position_name,
                    candidates: []
                };
            }

            const famBreakdown = familyVotes
                .filter(fv => fv.candidate_id === row.candidate_id)
                .map(fv => ({
                    family_id: fv.family_id ? fv.family_id.toString() : "অজানা ফ্যামিলি",
                    vote_count: fv.vote_count
                }));

            grouped[row.position_id].candidates.push({
                candidate_id: row.candidate_id,
                candidate_name: row.candidate_name,
                symbol_name: row.symbol_name,
                photo_url: row.photo_url,
                symbol_photo_url: row.symbol_photo_url,
                received_votes: row.vote_count,
                family_breakdown: famBreakdown,
                is_winner: false 
            });
        });

        res.json({
            success: true,
            election_status: electionStatus,
            total_eligible_voters: totalEligibleVoters,
            total_cast_votes: totalCastVotes,
            remaining_votes: remainingVotes,
            results: Object.values(grouped)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ফলাফল লোড করতে ব্যর্থ: ' + err.message });
    }
};

// ১০. প্রার্থীর স্ট্যাটাস পরিবর্তন (অ্যাডমিন)
exports.changeCandidateStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; 
    try {
        await db.query('UPDATE candidates SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: 'প্রার্থীর স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ১১. প্রার্থীর আবেদন ডিলিট বা বাতিল করা (অ্যাডমিন)
exports.deleteCandidate = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM candidates WHERE id = ?', [id]);
        res.json({ success: true, message: 'প্রার্থীর আবেদন সফলভাবে বাতিল বা ডিলিট করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ১২. অ্যাডমিন প্যানেল থেকে ম্যানুয়ালি প্রার্থী যোগ করা
exports.adminAddCandidate = async (req, res) => {
    const { election_id, position_id, candidate_name, candidate_age, symbol_name, reason, manifesto } = req.body;
    
    const rawCandidatePhoto = req.files && req.files['candidate_photo'] ? req.files['candidate_photo'][0] : null;
    const rawSymbolPhoto = req.files && req.files['symbol_photo'] ? req.files['symbol_photo'][0] : null;

    const candidatePhoto = rawCandidatePhoto ? await compressAndSaveImage(rawCandidatePhoto) : null;
    const symbolPhoto = rawSymbolPhoto ? await compressAndSaveImage(rawSymbolPhoto) : null;

    try {
        const [election] = await db.query('SELECT status FROM elections WHERE id = ?', [election_id]);
        if (election.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি।' });

        if (election[0].status === 'CLOSED') {
            return res.status(400).json({ success: false, message: 'এই নির্বাচনটি ইতোমধ্যে বন্ধ হয়ে গেছে।' });
        }

        // status কলাম এবং 'APPROVED' ভ্যালু এখান থেকে সম্পূর্ণ বাদ দেওয়া হলো
        await db.query(
            `INSERT INTO candidates (election_id, position_id, member_id, candidate_name, candidate_age, candidate_photo, symbol_name, symbol_photo, reason, manifesto)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            [election_id, position_id, candidate_name, candidate_age || null, candidatePhoto, symbol_name || null, symbolPhoto, reason || "সেবা করার উদ্দেশ্যে", manifesto || "সততা ও নিষ্ঠা"]
        );

        res.json({ success: true, message: 'অ্যাডমিন প্যানেল থেকে সফলভাবে প্রার্থী যোগ করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ১৩. নির্বাচন ডিলিট করা (অ্যাডমিন) - নতুন যুক্ত করা হলো
exports.deleteElection = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [election] = await connection.query('SELECT id FROM elections WHERE id = ?', [id]);
        if (election.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'নির্বাচনটি পাওয়া যায়নি।' });
        }

        // রিলেটেড টেবিলগুলোর ডাটা ডিলিট করা (Foreign Key Constraint এড়াতে)
        await connection.query('DELETE FROM votes WHERE election_id = ?', [id]);
        await connection.query('DELETE FROM candidates WHERE election_id = ?', [id]);
        await connection.query('DELETE FROM election_positions WHERE election_id = ?', [id]);
        await connection.query('DELETE FROM elections WHERE id = ?', [id]);

        await connection.commit();
        res.json({ success: true, message: 'নির্বাচন এবং এর সাথে সম্পর্কিত সকল ডেটা সফলভাবে ডিলিট করা হয়েছে।' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: 'নির্বাচন ডিলিট করতে ব্যর্থ: ' + error.message });
    } finally {
        connection.release();
    }
};