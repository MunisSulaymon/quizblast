const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const GameResult = require('../models/GameResult');
const auth = require('../middleware/auth');

// GET ALL MY QUIZZES
router.get('/', auth, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ hostId: req.user.id })
      .sort({ createdAt: -1 });
    const quizzesWithStats = await Promise.all(
      quizzes.map(async (quiz) => {
        const timesPlayed = await GameResult.countDocuments({ 
          quizId: quiz._id 
        });
        return { 
          ...quiz.toObject(), 
          timesPlayed,
          questionCount: quiz.questions.length 
        };
      })
    );
    res.json(quizzesWithStats);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// SAVE NEW QUIZ
router.post('/', auth, async (req, res) => {
  try {
    const { title, questions, settings } = req.body;
    if (!title || !questions || questions.length === 0)
      return res.status(400).json({ 
        msg: 'Title and questions required' 
      });
    const quiz = new Quiz({ 
      hostId: req.user.id, 
      title, questions, settings 
    });
    await quiz.save();
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET ONE QUIZ
router.get('/:id', auth, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ 
      _id: req.params.id, 
      hostId: req.user.id 
    });
    if (!quiz) return res.status(404).json({ msg: 'Not found' });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// UPDATE QUIZ
router.put('/:id', auth, async (req, res) => {
  try {
    const quiz = await Quiz.findOneAndUpdate(
      { _id: req.params.id, hostId: req.user.id },
      { $set: req.body },
      { new: true }
    );
    if (!quiz) return res.status(404).json({ msg: 'Not found' });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE QUIZ
router.delete('/:id', auth, async (req, res) => {
  try {
    await Quiz.deleteOne({ 
      _id: req.params.id, 
      hostId: req.user.id 
    });
    await GameResult.deleteMany({ quizId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
