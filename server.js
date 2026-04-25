require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const GameResult = require('./models/GameResult');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*", methods: ["GET", "POST"] }
});

app.use(helmet({ 
  contentSecurityPolicy: false 
}));
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Game storage
const games = new Map();

// PIN generation (cryptographically secure)
function generatePIN() {
  return crypto.randomInt(100000, 999999).toString();
}

/* ---- FISHER-YATES SHUFFLE ---- */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleAnswers(question) {
  const originalCorrect = question.answers[question.correctIndex];
  const shuffled = shuffle(question.answers);
  return {
    ...question,
    answers: shuffled,
    correctIndex: shuffled.indexOf(originalCorrect)
  };
}

/* ---- UPDATE calculateScore ---- */
function calculateScore(timeTaken, totalTime, isCorrect, pointsType, questionType) {
  if (!isCorrect) return 0;
  if (pointsType === 'none') return 0;
  if (questionType === 'poll') return 0;
  const base = Math.round(1000 * (1 - ((timeTaken / totalTime) / 2)));
  if (pointsType === 'double') return base * 2;
  return base;
}

// Streak multiplier
function getMultiplier(streak) {
  if (streak >= 10) return 1.5;
  if (streak >= 5) return 1.2;
  if (streak >= 3) return 1.1;
  return 1.0;
}

/* ---- UPDATE startQuestion ---- */
function startQuestion(pin) {
  const game = games.get(pin);
  if (!game) return;

  const q = game.questions[game.currentQuestion];
  const qSettings = q.settings || {};
  let timeLeft = qSettings.timeLimit || 20;

  game.questionStartTime = Date.now();
  game.answersReceived = 0;
  game.answerCounts = [0, 0, 0, 0];
  game.state = 'QUESTION';

  const payload = {
    questionIndex: game.currentQuestion,
    totalQuestions: game.questions.length,
    question: game.settings?.showQuestionOnDevice ? q.question : null,
    answers: q.answers,
    timeLimit: timeLeft,
    type: qSettings.questionType || 'quiz',
    pointsType: qSettings.pointsType || 'standard'
  };

  // Show double points warning before question
  if (qSettings.pointsType === 'double') {
    io.to(pin).emit('doublePointsWarning');
    setTimeout(() => {
      io.to(pin).emit('nextQuestion', payload);
      startTimer(pin, timeLeft);
    }, 2500);
  } else {
    io.to(pin).emit('nextQuestion', payload);
    startTimer(pin, timeLeft);
  }
}

/* ---- SEPARATE TIMER FUNCTION ---- */
function startTimer(pin, timeLeft) {
  const game = games.get(pin);
  if (!game) return;
  
  if (game.timer) {
    clearInterval(game.timer);
    game.timer = null;
  }

  game.timer = setInterval(() => {
    timeLeft--;
    io.to(pin).emit('timerTick', timeLeft);
    if (timeLeft <= 0 || 
        game.answersReceived >= game.players.size) {
      clearInterval(game.timer);
      endRound(pin);
    }
  }, 1000);
}

/* ---- UPDATE endRound for autoPlay ---- */
function endRound(pin) {
  const game = games.get(pin);
  if (!game) return;
  game.state = 'SCOREBOARD';

  const q = game.questions[game.currentQuestion];
  const players = Array.from(game.players.values())
    .sort((a,b) => b.score - a.score);

  io.to(pin).emit('roundResults', {
    correctIndex: q.correctIndex,
    correctAnswer: q.answers[q.correctIndex],
    answerCounts: game.answerCounts,
    leaderboard: players.slice(0,5).map((p,i) => ({
      rank: i+1, name: p.name, score: p.score
    })),
    allPlayers: players
  });

  // Auto-play countdown
  if (game.settings?.autoPlay) {
    let countdown = 5;
    const autoInterval = setInterval(() => {
      io.to(pin).emit('autoAdvanceCountdown', countdown);
      countdown--;
      if (countdown < 0) {
        clearInterval(autoInterval);
        io.to(pin).emit('autoAdvanceDone');
        advanceGame(pin);
      }
    }, 1000);
  }
}

/* ---- ADVANCE GAME LOGIC ---- */
async function advanceGame(pin) {
  const game = games.get(pin);
  if (!game) return;

  game.currentQuestion++;
  game.players.forEach(p => { p.answered = false; });

  if (game.currentQuestion >= game.questions.length) {
    const allPlayers = Array.from(game.players.values())
      .sort((a,b) => b.score - a.score);
    await saveGameResult(pin);  // ADD THIS
    io.to(pin).emit('podium', {
      winners: allPlayers.slice(0,3),
      allPlayers
    });
    games.delete(pin);
  } else {
    startQuestion(pin);
  }
}

// ADD saveGameResult() function BEFORE io.on():
async function saveGameResult(pin) {
  const game = games.get(pin);
  if (!game || !game.hostId_db) return;
  if (!game.quizId_db) return; // ADD THIS CHECK
  
  try {
    // Check quiz still exists
    const Quiz = require('./models/Quiz');
    const quizExists = await Quiz.findById(game.quizId_db);
    if (!quizExists) {
      console.log('Quiz was deleted, skipping result save');
      return;
    }
    
    const players = Array.from(game.players.values());
    const totalAnswers = players.length * game.questions.length;
    const totalCorrect = players.reduce(
      (a, p) => a + (p.correctCount || 0), 0
    );

    const result = new GameResult({
      quizId: game.quizId_db,
      hostId: game.hostId_db,
      totalPlayers: players.length,
      avgScore: players.length > 0
        ? Math.round(
            players.reduce((a, p) => a + p.score, 0) / players.length
          )
        : 0,
      accuracyRate: totalAnswers > 0
        ? Math.round((totalCorrect / totalAnswers) * 100)
        : 0,
      players: players.map(p => ({
        name: p.name,
        score: p.score,
        correctCount: p.correctCount || 0,
        accuracy: game.questions.length > 0
          ? Math.round(
              ((p.correctCount || 0) / game.questions.length) * 100
            )
          : 0
      })),
      questionStats: game.questionStats.map((s, i) => ({
        questionIndex: i,
        correctCount: s.correctCount,
        avgTime: players.length > 0 
          ? Math.round(s.totalTime / players.length * 10) / 10
          : 0
      }))
    });

    await result.save();
    console.log(`✅ Game result saved for PIN ${pin}`);
  } catch (err) {
    console.error('Failed to save game result:', err);
  }
}

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quizzes', require('./routes/quiz'));
app.use('/api/analytics', require('./routes/analytics'));

io.on('connection', (socket) => {

  // HOST: Create game
  socket.on('createGame', (quizData) => {
    let pin;
    do {
      pin = generatePIN();
    } while (games.has(pin));

    games.set(pin, {
      hostId: socket.id,
      hostId_db: quizData.hostId_db || null,
      quizId_db: quizData.quizId_db || null,
      players: new Map(),
      questions: quizData.questions,
      title: quizData.title,
      settings: quizData.settings || {},
      currentQuestion: 0,
      state: 'LOBBY',
      timer: null,
      answersReceived: 0,
      answerCounts: [0,0,0,0],
      questionStartTime: null,
      questionStats: quizData.questions.map(() => ({ 
        correctCount: 0, 
        totalTime: 0 
      })),
      locked: false
    });
    socket.join(pin);
    socket.emit('gameCreated', { pin });
  });

  /* ---- LOCK ROOM ---- */
  socket.on('lockRoom', ({ pin, locked }) => {
    const game = games.get(pin);
    if (game && game.hostId === socket.id) {
      game.locked = locked;
      io.to(pin).emit('roomLockStatus', locked);
    }
  });

  /* ---- SKIP QUESTION ---- */
  socket.on('skipQuestion', (pin) => {
    const game = games.get(pin);
    if (game && game.hostId === socket.id) {
      if (game.timer) clearInterval(game.timer);
      endRound(pin);
    }
  });

  // PLAYER: Join game
  socket.on('joinGame', ({ pin, name }) => {
    const game = games.get(pin);
    if (!game) return socket.emit('errorMsg', 'Invalid PIN code.');
    if (game.locked) return socket.emit('errorMsg', '🔒 This room is locked.');
    if (game.state !== 'LOBBY') return socket.emit('errorMsg', 'Game already in progress.');
    
    const nameTaken = Array.from(game.players.values()).some(p => p.name === name);
    if (nameTaken) return socket.emit('errorMsg', 'Nickname already taken.');

    const badWords = ['badword1', 'badword2'];
    if (game.settings?.nicknameFilter) {
      const hasBad = badWords.some(w => name.toLowerCase().includes(w));
      if (hasBad) return socket.emit('errorMsg', 'Please choose an appropriate nickname.');
    }

    game.players.set(socket.id, {
      name, score: 0, streak: 0,
      answered: false, lastCorrect: false,
      pin
    });
    socket.join(pin);
    socket.emit('joinedGame', { name, pin });
    io.to(pin).emit('playerJoined', {
      players: Array.from(game.players.values()).map(p => p.name),
      count: game.players.size
    });
  });

  // HOST: Start game
  socket.on('startGame', (pin) => {
    const game = games.get(pin);
    if (!game || game.hostId !== socket.id) return;
    if (game.state !== 'LOBBY') return; // GUARD

    if (game.settings?.randomizeQuestions) {
      game.questions = shuffle(game.questions);
    }
    if (game.settings?.randomizeAnswers) {
      game.questions = game.questions.map(shuffleAnswers);
    }
    startQuestion(pin);
  });

  // PLAYER: Submit answer
  socket.on('submitAnswer', ({ pin, answerIndex }) => {
    const game = games.get(pin);
    if (!game || game.state !== 'QUESTION') return;

    const player = game.players.get(socket.id);
    if (!player || player.answered) return;

    player.answered = true;
    game.answersReceived++;

    const timeTaken = (Date.now() - game.questionStartTime) / 1000;
    const question = game.questions[game.currentQuestion];
    const isCorrect = answerIndex === question.correctIndex;
    const qSettings = question.settings || {};

    if (!game.answerCounts) game.answerCounts = [0, 0, 0, 0];
    game.answerCounts[answerIndex]++;

    if (isCorrect) {
      player.streak++;
      const multiplier = getMultiplier(player.streak);
      const points = Math.round(
        calculateScore(
          timeTaken, 
          qSettings.timeLimit || 20, 
          isCorrect, 
          qSettings.pointsType || 'standard',
          qSettings.questionType || 'quiz'
        ) * multiplier
      );
      player.score += points;
      player.lastPoints = points;
      player.lastCorrect = true;
    } else {
      player.streak = 0;
      player.lastPoints = 0;
      player.lastCorrect = false;
    }

    // Track question stats
    const qIdx = game.currentQuestion;
    if (!game.questionStats[qIdx]) {
      game.questionStats[qIdx] = { correctCount: 0, totalTime: 0 };
    }
    if (isCorrect) {
      game.questionStats[qIdx].correctCount++;
      if (!player.correctCount) player.correctCount = 0;
      player.correctCount++;
    }
    game.questionStats[qIdx].totalTime += timeTaken;

    const allPlayers = Array.from(game.players.values());
    const sorted = allPlayers.sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(p => p.name === player.name) + 1;

    socket.emit('answerResult', {
      correct: isCorrect,
      correctIndex: question.correctIndex,
      correctAnswer: question.answers[question.correctIndex],
      points: player.lastPoints,
      totalScore: player.score,
      streak: player.streak,
      rank,
      totalPlayers: game.players.size
    });

    io.to(game.hostId).emit('playerAnswered', {
      count: game.answersReceived,
      total: game.players.size
    });
  });

  // HOST: Next question
  socket.on('nextQuestion', (pin) => {
    const game = games.get(pin);
    if (!game || game.hostId !== socket.id) return;
    advanceGame(pin);
  });

  // DISCONNECT handling
  socket.on('disconnect', () => {
    games.forEach((game, pin) => {
      if (game.hostId === socket.id) {
        io.to(pin).emit('gameTerminated', 'Host disconnected. Game over.');
        clearInterval(game.timer);
        games.delete(pin);
      } else if (game.players.has(socket.id)) {
        const player = game.players.get(socket.id);
        game.players.delete(socket.id);
        io.to(pin).emit('playerLeft', {
          name: player.name,
          count: game.players.size
        });
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`QuizBlast server running on port ${PORT}`);
});
