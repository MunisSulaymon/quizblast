const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  hostId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', required: true 
  },
  title: { type: String, required: true },
  questions: [{
    question: String,
    answers: [String],
    correctIndex: Number,
    acceptedAnswers: [String],
    settings: {
      timeLimit: { type: Number, default: 20 },
      pointsType: { 
        type: String, 
        enum: ['standard','double','none'], 
        default: 'standard' 
      },
      questionType: { 
        type: String, 
        enum: ['quiz','true-false','poll','type-answer'], 
        default: 'quiz' 
      },
      allowFuzzy: { type: Boolean, default: true },
      fuzzyTolerance: { type: Number, default: 2 }
    }
  }],
  settings: {
    randomizeQuestions: { type: Boolean, default: true },
    randomizeAnswers: { type: Boolean, default: false },
    showQuestionOnDevice: { type: Boolean, default: true },
    autoPlay: { type: Boolean, default: false },
    lobbyMusic: { type: String, default: 'classic' },
    nicknameFilter: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', quizSchema);
