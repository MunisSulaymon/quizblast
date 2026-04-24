require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));

// Game storage
const games = new Map();

// PIN generation (cryptographically secure)
function generatePIN() {
  return crypto.randomInt(100000, 999999).toString();
}

// Scoring with speed bonus
function calculateScore(timeTaken, totalTime, isCorrect) {
  if (!isCorrect) return 0;
  const basePoints = 1000;
  return Math.round(basePoints * (1 - ((timeTaken / totalTime) / 2)));
}

// Streak multiplier
function getMultiplier(streak) {
  if (streak >= 10) return 1.5;
  if (streak >= 5) return 1.2;
  if (streak >= 3) return 1.1;
  return 1.0;
}

// Server-side question timer
function startQuestion(pin) {
  const game = games.get(pin);
  if (!game) return;
  
  const question = game.questions[game.currentQuestion];
  let timeLeft = question.timeLimit || 20;
  game.questionStartTime = Date.now();
  game.answersReceived = 0;
  game.state = 'QUESTION';
  game.answerCounts = [0,0,0,0]; // Reset counts for new question

  io.to(pin).emit('nextQuestion', {
    questionIndex: game.currentQuestion,
    totalQuestions: game.questions.length,
    question: question.question,
    answers: question.answers,
    timeLimit: timeLeft
  });

  game.timer = setInterval(() => {
    timeLeft--;
    io.to(pin).emit('timerTick', timeLeft);

    if (timeLeft <= 0 || game.answersReceived >= game.players.size) {
      clearInterval(game.timer);
      endRound(pin);
    }
  }, 1000);
}

// End round and send results
function endRound(pin) {
  const game = games.get(pin);
  if (!game) return;
  game.state = 'SCOREBOARD';
  
  const question = game.questions[game.currentQuestion];
  const players = Array.from(game.players.values());
  const sorted = players.sort((a, b) => b.score - a.score);
  
  io.to(pin).emit('roundResults', {
    correctIndex: question.correctIndex,
    correctAnswer: question.answers[question.correctIndex],
    answerCounts: game.answerCounts || [0,0,0,0],
    leaderboard: sorted.slice(0, 5).map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score
    })),
    allPlayers: sorted.map(p => ({
      name: p.name,
      score: p.score
    }))
  });
}

io.on('connection', (socket) => {

  // HOST: Create game
  socket.on('createGame', (quizData) => {
    const pin = generatePIN();
    games.set(pin, {
      hostId: socket.id,
      players: new Map(),
      questions: quizData.questions,
      title: quizData.title,
      currentQuestion: 0,
      state: 'LOBBY',
      timer: null,
      answersReceived: 0,
      answerCounts: [0,0,0,0],
      questionStartTime: null
    });
    socket.join(pin);
    socket.emit('gameCreated', { pin });
  });

  // PLAYER: Join game
  socket.on('joinGame', ({ pin, name }) => {
    const game = games.get(pin);
    if (!game) return socket.emit('errorMsg', 'Invalid PIN code.');
    if (game.state !== 'LOBBY') return socket.emit('errorMsg', 'Game already in progress.');
    const nameTaken = Array.from(game.players.values()).some(p => p.name === name);
    if (nameTaken) return socket.emit('errorMsg', 'Nickname already taken.');
    
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
    if (game && game.hostId === socket.id) {
      startQuestion(pin);
    }
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
    
    if (!game.answerCounts) game.answerCounts = [0,0,0,0];
    game.answerCounts[answerIndex]++;
    
    if (isCorrect) {
      player.streak++;
      const multiplier = getMultiplier(player.streak);
      const points = Math.round(
        calculateScore(timeTaken, question.timeLimit || 20, true) * multiplier
      );
      player.score += points;
      player.lastPoints = points;
      player.lastCorrect = true;
    } else {
      player.streak = 0;
      player.lastPoints = 0;
      player.lastCorrect = false;
    }

    const allPlayers = Array.from(game.players.values());
    const sorted = allPlayers.sort((a,b) => b.score - a.score);
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
    
    game.currentQuestion++;
    game.answerCounts = [0,0,0,0];
    
    // Reset player answered state
    game.players.forEach(p => { p.answered = false; });

    if (game.currentQuestion >= game.questions.length) {
      // Game over — send podium
      const allPlayers = Array.from(game.players.values())
        .sort((a,b) => b.score - a.score);
      io.to(pin).emit('podium', {
        winners: allPlayers.slice(0, 3),
        allPlayers
      });
      games.delete(pin);
    } else {
      startQuestion(pin);
    }
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
  console.log(`QuizBlast running on port ${PORT}`);
});
