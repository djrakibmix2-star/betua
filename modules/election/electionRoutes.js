const express = require('express');
const router = express.Router();
const electionController = require('./electionController'); 

// ----------------- অ্যাডমিন রাউট -----------------
router.post('/create', electionController.createElection);
router.put('/:id/start-voting', electionController.startVoting); // ভোট গ্রহণ শুরু করার API
router.put('/:id/close', electionController.closeElection); // নির্বাচন শেষ করার API

// ----------------- ইউজার রাউট (প্রার্থীতা ও ভোট) -----------------
router.get('/', electionController.getAllElections);
router.get('/:id', electionController.getElectionDetails);

// প্রার্থীতা (Democratic Theme)
router.post('/apply-candidate', electionController.applyForCandidacy); // প্রার্থী হওয়ার আবেদন 
router.delete('/withdraw-candidate/:electionId/:candidateId/:memberId', electionController.withdrawCandidacy); // প্রার্থীতা প্রত্যাহার

// ভোটিং
router.post('/vote', electionController.castVote);

// ফলাফল ড্যাশবোর্ড
router.get('/:id/results', electionController.getElectionResults);

module.exports = router;