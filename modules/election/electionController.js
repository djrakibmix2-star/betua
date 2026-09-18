const db = require('../../config/db'); // আপনার প্রজেক্টের ডাটাবেস লোকেশন অনুযায়ী মিলিয়ে নেবেন

// ১. নতুন নির্বাচন তৈরি (অ্যাডমিন)
exports.createElection = async (req, res) => {
    const { title, description, application_deadline, eligible_gender, min_age, positions } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        // ডেটটাইম ফরম্যাট ঠিক করা (MySQL-এর DATETIME এর উপযোগী করতে 'Z' এবং 'T' রিমুভ করা)
        const formattedDeadline = application_deadline 
            ? application_deadline.replace('Z', '').replace('T', ' ') 
            : null;

        const [result] = await connection.query(
            'INSERT INTO elections (title, description, application_deadline, eligible_gender, min_age, status) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, formattedDeadline, eligible_gender, min_age, 'REGISTRATION']
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
        res.json({ success: true, message: 'নির্বাচন সফলভাবে তৈরি হয়েছে। এখন প্রার্থীরা আবেদন করতে পারবেন।' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// ২. ভোট গ্রহণ শুরু করা (অ্যাডমিন)
exports.startVoting = async (req, res) => {
    try {
        await db.query("UPDATE elections SET status = 'VOTING_STARTED' WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'আবেদন গ্রহণ বন্ধ হয়েছে এবং ভোট গ্রহণ শুরু হয়েছে!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৩. নির্বাচন সমাপ্ত ঘোষণা করা (অ্যাডমিন)
exports.closeElection = async (req, res) => {
    try {
        await db.query("UPDATE elections SET status = 'CLOSED' WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'নির্বাচন সমাপ্ত ঘোষণা করা হয়েছে! এখন ফলাফল দেখা যাবে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৪. সকল নির্বাচন দেখা
exports.getAllElections = async (req, res) => {
    try {
        const [elections] = await db.query('SELECT * FROM elections ORDER BY created_at DESC');
        res.json({ success: true, elections });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৫. নির্বাচনের বিস্তারিত ও প্রার্থীদের তালিকা দেখা
exports.getElectionDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const [electionInfo] = await db.query('SELECT * FROM elections WHERE id = ?', [id]);
        if (electionInfo.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি' });

        const [positions] = await db.query('SELECT * FROM election_positions WHERE election_id = ?', [id]);
        const [candidates] = await db.query('SELECT * FROM candidates WHERE election_id = ?', [id]);

        res.json({ success: true, election: electionInfo[0], positions, candidates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৬. প্রার্থী হওয়ার আবেদন (Democratic Logic - Auto Approval)
exports.applyForCandidacy = async (req, res) => {
    const { election_id, position_id, member_id, candidate_name, symbol_name, custom_photo, symbol_photo_url, candidate_age, reason, manifesto } = req.body;
    try {
        // স্ট্যাটাস ও ডেডলাইন চেক
        const [election] = await db.query('SELECT status, application_deadline FROM elections WHERE id = ?', [election_id]);
        if (election.length === 0) return res.status(404).json({ success: false, message: 'নির্বাচন পাওয়া যায়নি।' });

        if (election[0].status !== 'REGISTRATION') {
            return res.status(400).json({ success: false, message: 'এই নির্বাচনে এখন আর নতুন প্রার্থী যুক্ত হওয়ার সুযোগ নেই।' });
        }

        const now = new Date();
        const deadline = new Date(election[0].application_deadline);
        if (now > deadline) {
            return res.status(400).json({ success: false, message: 'আবেদনের সময়সীমা পার হয়ে গেছে।' });
        }

        const applyReason = reason || "সমাজ সেবার উদ্দেশ্যে";
        const applyManifesto = manifesto || "সততা ও নিষ্ঠার সাথে কাজ করব";

        // প্রার্থী ডাটাবেজে ইনসার্ট (অটো অ্যাপ্রুভ)
        await db.query(
            `INSERT INTO candidates (election_id, position_id, member_id, candidate_name, candidate_age, candidate_photo, symbol_name, symbol_photo, reason, manifesto)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [election_id, position_id, member_id, candidate_name, candidate_age || null, custom_photo || null, symbol_name || null, symbol_photo_url || null, applyReason, applyManifesto]
        );

        res.json({ success: true, message: 'আলহামদুলিল্লাহ! আপনার প্রার্থীতার আবেদন সফলভাবে জমা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৭. প্রার্থীতা প্রত্যাহার (Withdraw)
exports.withdrawCandidacy = async (req, res) => {
    const { electionId, candidateId, memberId } = req.params;
    try {
        const [election] = await db.query('SELECT status FROM elections WHERE id = ?', [electionId]);
        if (election[0].status !== 'REGISTRATION') {
            return res.status(400).json({ success: false, message: 'ভোট গ্রহণ শুরু হয়ে যাওয়ায় এখন আর প্রার্থীতা প্রত্যাহার করা সম্ভব নয়।' });
        }

        await db.query('DELETE FROM candidates WHERE id = ? AND member_id = ?', [candidateId, memberId]);
        res.json({ success: true, message: 'আপনার প্রার্থীতা সফলভাবে প্রত্যাহার করা হয়েছে।' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৮. ভোট প্রদান
exports.castVote = async (req, res) => {
    const { election_id, position_id, candidate_id, voter_id } = req.body;
    try {
        const [election] = await db.query('SELECT status FROM elections WHERE id = ?', [election_id]);
        if (election[0].status !== 'VOTING_STARTED') {
            return res.status(400).json({ success: false, message: 'বর্তমানে এই নির্বাচনের ভোটগ্রহণ চলছে না বা বন্ধ রয়েছে।' });
        }

        // এক পদে ডাবল ভোট চেক
        const [existing] = await db.query('SELECT id FROM votes WHERE election_id = ? AND position_id = ? AND voter_id = ?', [election_id, position_id, voter_id]);
        if (existing.length > 0) {
             return res.status(400).json({ success: false, message: 'দুঃখিত, আপনি ইতিমধ্যে এই পদে আপনার ভোটটি প্রদান করেছেন!' });
        }

        await db.query(
            'INSERT INTO votes (election_id, position_id, candidate_id, voter_id) VALUES (?, ?, ?, ?)',
            [election_id, position_id, candidate_id, voter_id]
        );

        res.json({ success: true, message: 'আলহামদুলিল্লাহ, আপনার ভোট সফলভাবে গ্রহণ করা হয়েছে!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ৯. ফলাফল ও ড্যাশবোর্ড (ফ্যামিলি ব্রেকডাউন সহ)
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