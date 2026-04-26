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
const { validateTypeAnswer } = require('./utils/levenshtein');

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
  game.typedAnswers = [];
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
    typedAnswers: game.typedAnswers || [],
    questionType: q.settings?.questionType || 'quiz',
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

function getPowerUpName(type) {
  const names = {
    doublePoints: '2X Points 📈',
    shield: 'Shield 🛡️',
    streakProtect: 'Streak Guard 🔥',
    hint: 'Hint 💡',
    freeze: 'Freeze ❄️',
    fiftyfifty: '50/50 ✂️'
  };
  return names[type] || type;
}

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
      settings: {
        ...(quizData.settings || {}),
        powerUpsEnabled: quizData.settings?.powerUpsEnabled || false
      },
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
  socket.on('submitAnswer', ({ pin, answerIndex, answerText, timeTaken }) => {
    const game = games.get(pin);
    if (!game || game.state !== 'QUESTION') return;

    const player = game.players.get(socket.id);
    if (!player || player.answered) return;

    player.answered = true;
    game.answersReceived++;

    const question = game.questions[game.currentQuestion];
    const qType = question.settings?.questionType || 'quiz';
    const qSettings = question.settings || {};
    let isCorrect = false;
    let matchType = 'none';
    let correctAnswer = '';

    if (qType === 'type-answer') {
      // Type answer validation
      const acceptedAnswers = question.acceptedAnswers || 
        [question.answers[question.correctIndex]];
      const result = validateTypeAnswer(
        answerText || '',
        acceptedAnswers,
        qSettings.allowFuzzy !== false,
        qSettings.fuzzyTolerance || 2
      );
      isCorrect = result.isCorrect;
      matchType = result.matchType;
      correctAnswer = acceptedAnswers[0];

      // Track typed answers for word cloud
      if (!game.typedAnswers) game.typedAnswers = [];
      game.typedAnswers.push(answerText || '');
    } else {
      // Multiple choice validation
      isCorrect = answerIndex === question.correctIndex;
      matchType = isCorrect ? 'exact' : 'none';
      correctAnswer = question.answers[question.correctIndex];
      
      if (!game.answerCounts) game.answerCounts = [0,0,0,0];
      if (answerIndex >= 0 && answerIndex < 4) {
        game.answerCounts[answerIndex]++;
      }
    }

    // Calculate base score
    const tl = qSettings.timeLimit || 20;
    const timeTakenSec = timeTaken || 
      (Date.now() - game.questionStartTime) / 1000;
    let points = 0;

    if (isCorrect) {
      const basePoints = Math.round(
        1000 * (1 - ((timeTakenSec / tl) / 2))
      );
      const fuzzyMultiplier = matchType === 'fuzzy' ? 0.75 : 1.0;
      let pointsType = qSettings.pointsType || 'standard';

      // Check double points power-up
      if (player.activeEffects?.includes('doublePoints')) {
        pointsType = 'double';
        player.activeEffects = player.activeEffects.filter(
          e => e !== 'doublePoints'
        );
      }

      const typeMultiplier = pointsType === 'double' ? 2 
        : pointsType === 'none' ? 0 : 1;

      // Streak multiplier
      player.streak = (player.streak || 0) + 1;
      const streakMult = player.streak >= 10 ? 1.5
        : player.streak >= 5 ? 1.2
        : player.streak >= 3 ? 1.1 : 1.0;

      points = Math.round(
        basePoints * fuzzyMultiplier * typeMultiplier * streakMult
      );

      // Track correct for question stats
      if (!game.questionStats) {
        game.questionStats = game.questions.map(() => ({ 
          correctCount: 0, totalTime: 0 
        }));
      }
      game.questionStats[game.currentQuestion].correctCount++;
      if (!player.correctCount) player.correctCount = 0;
      player.correctCount++;

      // Check if earned power-up (every 3 streak)
      if (game.settings?.powerUpsEnabled && 
          player.streak > 0 && player.streak % 3 === 0) {
        const powerups = [
          'doublePoints','shield','streakProtect',
          'hint','freeze','fiftyfifty'
        ];
        // Bottom half players get better powerups
        const allPlayers = Array.from(game.players.values())
          .sort((a,b) => b.score - a.score);
        const rank = allPlayers.findIndex(
          p => p.name === player.name
        ) + 1;
        const isBottomHalf = rank > allPlayers.length / 2;

        let availablePowerups = isBottomHalf 
          ? ['doublePoints','freeze','fiftyfifty','hint']
          : ['shield','streakProtect','doublePoints'];

        const randomPowerup = availablePowerups[
          Math.floor(Math.random() * availablePowerups.length)
        ];

        if (!player.powerups) player.powerups = [];
        if (player.powerups.length < 2) {
          player.powerups.push(randomPowerup);
          socket.emit('powerUpEarned', { 
            powerup: randomPowerup,
            message: getPowerUpName(randomPowerup)
          });
        }
      }
    } else {
      // Wrong answer
      if (player.activeEffects?.includes('streakProtect')) {
        player.activeEffects = player.activeEffects.filter(
          e => e !== 'streakProtect'
        );
      } else {
        player.streak = 0;
      }
    }

    if (game.questionStats) {
      game.questionStats[game.currentQuestion].totalTime += 
        timeTakenSec;
    }

    player.score = (player.score || 0) + points;
    player.lastPoints = points;
    player.lastCorrect = isCorrect;

    // Get player rank
    const allPlayers = Array.from(game.players.values())
      .sort((a,b) => b.score - a.score);
    const rank = allPlayers.findIndex(
      p => p.name === player.name
    ) + 1;

    socket.emit('answerResult', {
      correct: isCorrect,
      matchType,
      correctIndex: question.correctIndex,
      correctAnswer,
      points,
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

  socket.on('usePowerUp', ({ pin, powerupType, targetId }) => {
    const game = games.get(pin);
    if (!game || game.state !== 'QUESTION') return;

    const player = game.players.get(socket.id);
    if (!player || !player.powerups) return;

    const index = player.powerups.indexOf(powerupType);
    if (index === -1) return;

    // Remove from inventory
    player.powerups.splice(index, 1);

    const question = game.questions[game.currentQuestion];

    switch(powerupType) {
      case 'doublePoints':
        if (!player.activeEffects) player.activeEffects = [];
        player.activeEffects.push('doublePoints');
        socket.emit('powerUpEffect', { 
          type: 'doublePoints',
          message: '2X Points activated! 📈'
        });
        break;

      case 'streakProtect':
        if (!player.activeEffects) player.activeEffects = [];
        player.activeEffects.push('streakProtect');
        socket.emit('powerUpEffect', {
          type: 'streakProtect',
          message: 'Streak protected! 🔥'
        });
        break;

      case 'shield':
        if (!player.activeEffects) player.activeEffects = [];
        player.activeEffects.push('shielded');
        socket.emit('powerUpEffect', {
          type: 'shield',
          message: 'Shield activated! 🛡️'
        });
        break;

      case 'fiftyfifty':
        if (question.settings?.questionType === 'quiz') {
          const correctIdx = question.correctIndex;
          const wrongIndexes = [0,1,2,3]
            .filter(i => i !== correctIdx);
          const toRemove = wrongIndexes
            .sort(() => 0.5 - Math.random())
            .slice(0, 2);
          socket.emit('powerUpEffect', {
            type: 'fiftyfifty',
            removeIndexes: toRemove,
            message: '50/50 used! ✂️'
          });
        }
        break;

      case 'hint':
        if (question.settings?.questionType === 'type-answer') {
          const ans = (question.acceptedAnswers || [])[0] || 
            question.answers[question.correctIndex] || '';
          socket.emit('powerUpEffect', {
            type: 'hint',
            hint: ans.charAt(0).toUpperCase(),
            message: `Hint: Starts with "${ans.charAt(0).toUpperCase()}" 💡`
          });
        }
        break;

      case 'freeze':
        // Find target (random player ahead of them)
        const allPlayers = Array.from(game.players.entries())
          .sort(([,a],[,b]) => b.score - a.score);
        const myRank = allPlayers.findIndex(
          ([id]) => id === socket.id
        );
        const targets = allPlayers
          .slice(0, myRank)
          .filter(([id]) => {
            const p = game.players.get(id);
            return !p?.activeEffects?.includes('shielded') && 
                   !p?.answered;
          });

        if (targets.length > 0) {
          const [targetSocketId] = targets[
            Math.floor(Math.random() * targets.length)
          ];
          io.to(targetSocketId).emit('powerUpEffect', {
            type: 'frozen',
            duration: 3000,
            message: 'You are frozen! ❄️'
          });
          socket.emit('powerUpEffect', {
            type: 'freezeSent',
            message: 'Freeze sent! ❄️'
          });
          // Notify host
          io.to(game.hostId).emit('hostActivityLog', {
            message: `${player.name} froze someone! ❄️`
          });
        } else {
          socket.emit('powerUpEffect', {
            type: 'freezeFailed',
            message: 'No valid targets! ❄️'
          });
          // Refund powerup
          player.powerups.push('freeze');
        }
        break;
    }

    // Notify host of power-up usage
    io.to(game.hostId).emit('hostActivityLog', {
      message: `${player.name} used ${getPowerUpName(powerupType)}`
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
