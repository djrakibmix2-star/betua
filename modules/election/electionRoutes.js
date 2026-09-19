const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const electionController = require('./electionController'); 

// ----------------- Multer কনফিগারেশন (ছবি আপলোডের জন্য) -----------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // আপনার প্রজেক্টে 'uploads' ফোল্ডার থাকতে হবে
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ----------------- ১. লিস্ট ও জেনারেল রুট (সবার আগে থাকবে) -----------------
router.get('/list', electionController.getAllElections);
router.get('/', electionController.getAllElections);

// ----------------- ২. নির্দিষ্ট নির্বাচন ও ফলাফলের সাব-রুট (/:id এর আগে রাখতে হবে) -----------------
router.get('/:id/results', electionController.getElectionResults);
router.get('/:id/details', electionController.getElectionDetails);

// ----------------- ৩. অ্যাডমিন অ্যাকশন রুট -----------------
router.post('/create', electionController.createElection);
router.put('/:id/start-voting', electionController.startVoting); 
router.put('/:id/close', electionController.closeElection); 

// অ্যাডমিন কর্তৃক ম্যানুয়ালি প্রার্থী যোগ (ছবি আপলোডসহ)
router.post(
    '/admin/add-candidate', 
    upload.fields([
        { name: 'candidate_photo', maxCount: 1 }, 
        { name: 'symbol_photo', maxCount: 1 }
    ]), 
    electionController.adminAddCandidate
);

// প্রার্থীর স্ট্যাটাস আপডেট ও ডিলিট (অ্যাডমিন)
router.put('/candidates/:id/status', electionController.changeCandidateStatus);
router.delete('/candidates/:id', electionController.deleteCandidate);

// ----------------- ৪. ইউজার একশন (ছবিসহ আবেদন, প্রত্যাহার, ভোট) -----------------
router.post(
    '/apply-candidate', 
    upload.fields([
        { name: 'candidate_photo', maxCount: 1 }, 
        { name: 'symbol_photo', maxCount: 1 }
    ]), 
    electionController.applyForCandidacy
); 

router.delete('/withdraw-candidate/:electionId/:candidateId/:memberId', electionController.withdrawCandidacy); 
router.post('/vote', electionController.castVote); 

// ----------------- ৫. জেনেরিক আইডি রুট (সর্বশেষ থাকবে) -----------------
router.get('/:id', electionController.getElectionDetails);

module.exports = router;