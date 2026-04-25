const mongoose = require('mongoose');

const gameResultSchema = new mongoose.Schema({
  quizId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Quiz', required: true 
  },
  hostId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', required: true 
  },
  playedAt: { type: Date, default: Date.now },
  totalPlayers: Number,
  avgScore: Number,
  accuracyRate: Number,
  players: [{
    name: String,
    score: Number,
    accuracy: Number,
    correctCount: Number
  }],
  questionStats: [{
    questionIndex: Number,
    correctCount: Number,
    avgTime: Number,
    difficulty: String
  }]
});

module.exports = mongoose.model('GameResult', gameResultSchema);
