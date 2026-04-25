const express = require('express');
const router = express.Router();
const GameResult = require('../models/GameResult');
const auth = require('../middleware/auth');

// GET ALL SESSIONS SUMMARY
router.get('/', auth, async (req, res) => {
  try {
    const results = await GameResult.find({ hostId: req.user.id })
      .populate('quizId', 'title')
      .sort({ playedAt: -1 });

    const stats = {
      totalGames: results.length,
      totalPlayers: results.reduce((a, r) => a + r.totalPlayers, 0),
      avgScore: results.length > 0 
        ? Math.round(results.reduce((a, r) => a + r.avgScore, 0) / results.length)
        : 0,
      avgAccuracy: results.length > 0
        ? Math.round(results.reduce((a, r) => a + r.accuracyRate, 0) / results.length)
        : 0
    };

    res.json({ sessions: results, stats });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET ONE SESSION DETAIL
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await GameResult.findOne({ 
      _id: req.params.id, 
      hostId: req.user.id 
    }).populate('quizId', 'title questions');

    if (!result) return res.status(404).json({ msg: 'Not found' });

    // Add difficulty ratings
    const totalPlayers = result.totalPlayers || 1;
    const questionStats = result.questionStats.map(q => ({
      ...q.toObject(),
      correctPct: Math.round((q.correctCount / totalPlayers) * 100),
      difficulty: q.correctCount / totalPlayers > 0.7 ? 'Easy ✅'
        : q.correctCount / totalPlayers > 0.4 ? 'Medium ⚠️'
        : 'Hard ❌'
    }));

    const hardestQ = questionStats.sort(
      (a,b) => a.correctCount - b.correctCount
    )[0];
    const easiestQ = questionStats.sort(
      (a,b) => b.correctCount - a.correctCount
    )[0];

    res.json({
      ...result.toObject(),
      questionStats,
      hardestQuestion: hardestQ 
        ? `Q${hardestQ.questionIndex + 1} (${hardestQ.correctPct}% correct)` 
        : 'N/A',
      easiestQuestion: easiestQ
        ? `Q${easiestQ.questionIndex + 1} (${easiestQ.correctPct}% correct)`
        : 'N/A'
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
