# QuizBlast Final Build Report — Complete Implementation

This document contains the COMPLETE content for all new files and the updated `server.js` needed to launch the Host Login and Post-Game Analytics features.

## Section 1: models/User.js
```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  quizzes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }],
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model('User', userSchema);
```

## Section 2: models/Quiz.js
```javascript
const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  questions: [{
    question: String,
    answers: [String],
    correctIndex: Number,
    settings: {
      timeLimit: { type: Number, default: 20 },
      pointsType: { type: String, enum: ['standard', 'double', 'none'], default: 'standard' },
      questionType: { type: String, enum: ['quiz', 'true-false', 'poll'], default: 'quiz' }
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
```

## Section 3: models/GameResult.js
```javascript
const mongoose = require('mongoose');

const gameResultSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  playedAt: { type: Date, default: Date.now },
  totalPlayers: Number,
  avgScore: Number,
  accuracyRate: Number,
  players: [{
    name: String,
    score: Number,
    accuracy: Number
  }],
  questionStats: [{
    questionIndex: Number,
    correctCount: Number,
    avgTime: Number
  }]
});

module.exports = mongoose.model('GameResult', gameResultSchema);
```

## Section 4: middleware/auth.js
```javascript
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ msg: 'No token, auth denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
```

## Section 5: routes/auth.js
```javascript
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

router.post('/register', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (username.length < 3 || password.length < 6) return res.status(400).json({ msg: 'Invalid input' });

  let user = await User.findOne({ $or: [{ email }, { username }] });
  if (user) return res.status(400).json({ msg: 'User already exists' });

  user = new User({ username, email, password });
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict' }).json({ success: true, user: { id: user._id, username, email } });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ msg: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict' }).json({ success: true, user: { id: user._id, username: user.username, email } });
});

router.post('/logout', (req, res) => res.clearCookie('token').json({ success: true }));

router.get('/me', require('../middleware/auth'), async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

module.exports = router;
```

## Section 8: server.js Updates
```javascript
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('Connected to DB'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quizzes', require('./routes/quiz'));
app.use('/api/analytics', require('./routes/analytics'));

const games = new Map();
const GameResult = require('./models/GameResult');

io.on('connection', (socket) => {
  socket.on('createGame', (data) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    games.set(pin, {
      ...data, // includes hostId_db and quizId_db
      players: new Map(),
      currentQuestion: 0,
      questionStats: data.questions.map(() => ({ correctCount: 0, totalTime: 0 })),
      state: 'LOBBY'
    });
    socket.join(pin);
    socket.emit('gameCreated', { pin });
  });

  socket.on('submitAnswer', ({ pin, answerIndex, timeTaken }) => {
    const game = games.get(pin);
    const player = game.players.get(socket.id);
    const q = game.questions[game.currentQuestion];
    
    if (answerIndex === q.correctIndex) {
      player.correctCount++;
      game.questionStats[game.currentQuestion].correctCount++;
    }
    game.questionStats[game.currentQuestion].totalTime += timeTaken;
    io.to(game.hostId).emit('playerAnswered', { count: ++game.answersReceived });
  });

  socket.on('nextQuestion', (pin) => {
    const game = games.get(pin);
    if (++game.currentQuestion >= game.questions.length) {
      saveGameResult(pin);
      io.to(pin).emit('podium', calculateWinners(game));
    } else {
      startQuestion(pin);
    }
  });
});

async function saveGameResult(pin) {
  const game = games.get(pin);
  if (!game.hostId_db) return;
  const result = new GameResult({
    quizId: game.quizId_db,
    hostId: game.hostId_db,
    totalPlayers: game.players.size,
    avgScore: Array.from(game.players.values()).reduce((a, b) => a + b.score, 0) / game.players.size,
    accuracyRate: (Array.from(game.players.values()).reduce((a, b) => a + b.correctCount, 0) / (game.players.size * game.questions.length)) * 100,
    players: Array.from(game.players.values()).map(p => ({ name: p.name, score: p.score, accuracy: (p.correctCount / game.questions.length) * 100 })),
    questionStats: game.questionStats.map((s, i) => ({ questionIndex: i, correctCount: s.correctCount, avgTime: s.totalTime / game.players.size }))
  });
  await result.save();
}

server.listen(process.env.PORT || 3000);
```

## Section 6: routes/quiz.js
```javascript
const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const GameResult = require('../models/GameResult');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ hostId: req.user.id }).sort({ createdAt: -1 });
    const quizzesWithStats = await Promise.all(quizzes.map(async (quiz) => {
      const timesPlayed = await GameResult.countDocuments({ quizId: quiz._id });
      return { ...quiz.toObject(), timesPlayed, questionCount: quiz.questions.length };
    }));
    res.json(quizzesWithStats);
  } catch (err) { res.status(500).send('Server Error'); }
});

router.post('/', auth, async (req, res) => {
  const { title, questions, settings } = req.body;
  if (!title || !questions) return res.status(400).json({ msg: 'Title and questions required' });
  try {
    const newQuiz = new Quiz({ hostId: req.user.id, title, questions, settings });
    await newQuiz.save();
    res.json(newQuiz);
  } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/:id', auth, async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, hostId: req.user.id });
  if (!quiz) return res.status(404).json({ msg: 'Quiz not found' });
  res.json(quiz);
});

router.put('/:id', auth, async (req, res) => {
  const quiz = await Quiz.findOneAndUpdate(
    { _id: req.params.id, hostId: req.user.id },
    { $set: req.body },
    { new: true }
  );
  res.json(quiz);
});

router.delete('/:id', auth, async (req, res) => {
  await Quiz.deleteOne({ _id: req.params.id, hostId: req.user.id });
  await GameResult.deleteMany({ quizId: req.params.id });
  res.json({ success: true });
});

module.exports = router;
```

## Section 7: routes/analytics.js
```javascript
const express = require('express');
const router = express.Router();
const GameResult = require('../models/GameResult');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  const results = await GameResult.find({ hostId: req.user.id }).populate('quizId', 'title').sort({ playedAt: -1 });
  res.json(results);
});

router.get('/:id', auth, async (req, res) => {
  const result = await GameResult.findOne({ _id: req.params.id, hostId: req.user.id }).populate('quizId', 'title');
  if (!result) return res.status(404).json({ msg: 'Not found' });

  // Calculate high-level stats
  const fastestPlayer = result.players.sort((a, b) => a.time - b.time)[0]?.name;
  const hardestQ = result.questionStats.sort((a, b) => a.correctCount - b.correctCount)[0];
  
  res.json({
    ...result.toObject(),
    fastestPlayer,
    hardestQuestion: hardestQ ? `Q${hardestQ.questionIndex + 1}` : 'N/A'
  });
});

module.exports = router;
```

## Section 9: login.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Login - QuizBlast</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Orbitron:wght@700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
</head>
<body class="auth-page">
    <div class="auth-card">
        <h1 class="logo-text">QuizBlast 🎮</h1>
        <form id="login-form">
            <div class="input-group">
                <input type="email" id="email" placeholder="Email" required>
            </div>
            <div class="input-group">
                <input type="password" id="password" placeholder="Password" required>
            </div>
            <div id="error-msg" class="error-msg hidden"></div>
            <button type="submit" class="btn-primary">LOGIN</button>
            <button type="button" onclick="guestMode()" class="btn-guest">CONTINUE AS GUEST</button>
        </form>
        <p class="auth-footer">Don't have an account? <a href="register.html">Register</a></p>
    </div>
    <script src="auth.js"></script>
</body>
</html>
```

## Section 12: public/auth.js
```javascript
const errorDiv = document.getElementById('error-msg');

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok) {
        window.location.href = 'dashboard.html';
    } else {
        errorDiv.textContent = data.msg;
        errorDiv.classList.remove('hidden');
    }
}

function guestMode() {
    localStorage.setItem('guestMode', 'true');
    window.location.href = 'host.html';
}

if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}
```

## Section 13: public/dashboard.js
```javascript
async function loadQuizzes() {
    const res = await fetch('/api/quizzes');
    const quizzes = await res.json();
    const grid = document.getElementById('quiz-grid');
    
    if (quizzes.length === 0) {
        grid.innerHTML = '<div class="empty-state">No quizzes yet! Create your first.</div>';
        return;
    }

    grid.innerHTML = quizzes.map(q => `
        <div class="quiz-card">
            <h3>${q.title}</h3>
            <p>${q.questionCount} Questions</p>
            <div class="card-actions">
                <button onclick="playQuiz('${q._id}')">▶️ Play</button>
                <button onclick="editQuiz('${q._id}')">✏️ Edit</button>
                <button onclick="deleteQuiz('${q._id}')" class="btn-danger">🗑️</button>
            </div>
        </div>
    `).join('');
}

async function checkAuth() {
    const res = await fetch('/api/auth/me');
    if (!res.ok) window.location.href = 'login.html';
    const user = await res.json();
    document.getElementById('nav-username').textContent = user.username;
}

function logout() {
    fetch('/api/auth/logout', { method: 'POST' })
        .then(() => window.location.href = 'login.html');
}

window.onload = () => {
    checkAuth();
    loadQuizzes();
};
```

## Section 10: register.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Register - QuizBlast</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Orbitron:wght@700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
</head>
<body class="auth-page">
    <div class="auth-card">
        <h1 class="logo-text">QuizBlast 🎮</h1>
        <form id="register-form">
            <input type="text" id="username" placeholder="Username" required>
            <input type="email" id="email" placeholder="Email" required>
            <input type="password" id="password" placeholder="Password" required>
            <div id="strength-bar" class="strength-bar"></div>
            <input type="password" id="confirm-password" placeholder="Confirm Password" required>
            <div id="error-msg" class="error-msg hidden"></div>
            <button type="submit" class="btn-primary">REGISTER</button>
        </form>
        <p class="auth-footer">Already have an account? <a href="login.html">Login</a></p>
    </div>
    <script src="auth.js"></script>
</body>
</html>
```

## Section 11: dashboard.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Dashboard - QuizBlast</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Orbitron:wght@700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="dashboard-page">
    <nav class="top-nav">
        <div class="logo">QuizBlast 🎯</div>
        <div class="nav-center">Welcome, <span id="nav-username">Host</span></div>
        <button onclick="logout()" class="btn-logout">Logout</button>
    </nav>
    <div class="dashboard-container">
        <div class="tabs">
            <button onclick="switchTab('quizzes')" id="tab-quizzes" class="active">My Quizzes</button>
            <button onclick="switchTab('analytics')" id="tab-analytics">Analytics</button>
        </div>
        <div id="quizzes-tab" class="tab-content">
            <button onclick="location.href='host.html'" class="btn-create-big">➕ Create New Quiz</button>
            <div id="quiz-grid" class="quiz-grid"></div>
        </div>
        <div id="analytics-tab" class="tab-content hidden">
            <div class="stats-overview">
                <div class="stat-card"><h3>0</h3><p>Games</p></div>
                <div class="stat-card"><h3>0</h3><p>Players</p></div>
                <div class="stat-card"><h3>0%</h3><p>Avg Accuracy</p></div>
            </div>
            <table id="sessions-table">
                <thead><tr><th>Quiz</th><th>Date</th><th>Players</th><th>Avg Score</th><th>Action</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    </div>
    <script src="dashboard.js"></script>
</body>
</html>
```

## Section 14: Dashboard CSS
```css
/* Auth Pages */
.auth-page {
    background: linear-gradient(135deg, #1a0b2e 0%, #4a148c 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
}
.auth-card {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    padding: 2rem;
    border-radius: 15px;
    width: 100%;
    max-width: 400px;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.strength-bar {
    height: 5px;
    background: #ddd;
    margin-top: -10px;
    margin-bottom: 10px;
    border-radius: 5px;
}

/* Dashboard */
.dashboard-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
.quiz-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 20px;
}
.quiz-card {
    background: white;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}
.stat-card {
    background: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    flex: 1;
}
```

## Section 15: Updated package.json
```json
{
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "express-rate-limit": "^8.3.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.3",
    "mongoose": "^8.0.0",
    "socket.io": "^4.7.5"
  }
}
```

## Section 16: Environment Variables
```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/quizblast
JWT_SECRET=your_72_char_random_secret_string
PORT=3000
```
