# QuizBlast Host Login & Analytics — Implementation Blueprint V2

This document provides the complete technical specifications and code blueprints for the Host Authentication system and Post-Game Analytics dashboard.

## Section 1: Complete HTML/CSS for New Screens

### SCREEN 1 & 2: Login & Register (auth.html)
*Integrated centered layout with purple branding.*

```html
<!-- login.html -->
<div class="auth-container">
    <div class="auth-card">
        <h1>QuizBlast 🎮</h1>
        <form id="login-form">
            <input type="email" id="email" placeholder="Email" required>
            <input type="password" id="password" placeholder="Password" required>
            <div id="auth-error" class="error-msg hidden"></div>
            <button type="submit" class="btn-primary">Login</button>
            <button type="button" onclick="guestMode()" class="btn-guest">Continue as Guest</button>
        </form>
        <p>Don't have an account? <a href="register.html">Register</a></p>
    </div>
</div>
```

### SCREEN 3: Host Dashboard (dashboard.html)
```html
<div class="dashboard-layout">
    <aside class="sidebar">
        <div class="logo">QuizBlast 🎯</div>
        <nav>
            <a href="#" class="active">📚 My Quizzes</a>
            <a href="analytics.html">📊 Analytics</a>
            <button onclick="location.href='host.html'" class="btn-create">➕ Create New</button>
        </nav>
        <div class="user-profile">
            <span id="nav-username">Host</span>
            <button onclick="logout()">Logout</button>
        </div>
    </aside>
    <main class="content">
        <header><h1>My Library</h1></header>
        <div id="quiz-grid" class="quiz-grid">
            <!-- Dynamic Quiz Cards -->
        </div>
    </main>
</div>
```

## Section 2: Complete server.js Changes
```javascript
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

// 1. Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// 2. Middleware
app.use(express.json());
app.use(cookieParser());

// 3. Route Registration
app.use('/api/auth', require('./routes/auth'));
app.use('/api/quizzes', require('./routes/quiz'));
app.use('/api/analytics', require('./routes/analytics'));

// 4. Save Game Result Logic (Internal)
function saveGameResult(pin) {
    const game = games.get(pin);
    if (!game || !game.hostId_db) return; // Only save for logged-in hosts

    const results = {
        quizId: game.quizId_db,
        hostId: game.hostId_db,
        totalPlayers: game.players.size,
        avgScore: calculateAvgScore(game.players),
        accuracyRate: calculateAccuracy(game.players, game.questions.length),
        players: Array.from(game.players.values()).map(p => ({
            name: p.name,
            score: p.score,
            accuracy: (p.correctCount / game.questions.length) * 100
        })),
        questionStats: game.questions.map((q, i) => ({
            questionIndex: i,
            totalCorrect: game.questionStats[i].correctCount,
            avgResponseTime: game.questionStats[i].totalTime / game.players.size
        }))
    };
    new GameResult(results).save();
}
```

## Section 3: Complete routes/auth.js
```javascript
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'Email already exists' });

        user = new User({ username, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict' }).json({ user });
    } catch (err) { res.status(500).send('Server error'); }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'strict' }).json({ user });
});

router.post('/logout', (req, res) => {
    res.clearCookie('token').json({ msg: 'Logged out' });
});
```

## Section 4: Complete routes/quiz.js
```javascript
const auth = require('../middleware/auth');
const Quiz = require('../models/Quiz');

router.post('/', auth, async (req, res) => {
    const quiz = new Quiz({ ...req.body, hostId: req.user.id });
    await quiz.save();
    res.json(quiz);
});

router.get('/', auth, async (req, res) => {
    const quizzes = await Quiz.find({ hostId: req.user.id }).sort({ createdAt: -1 });
    res.json(quizzes);
});

router.delete('/:id', auth, async (req, res) => {
    await Quiz.findOneAndDelete({ _id: req.params.id, hostId: req.user.id });
    res.json({ msg: 'Deleted' });
});
```

## Section 5: Complete routes/analytics.js
```javascript
router.get('/summary', auth, async (req, res) => {
    const results = await GameResult.find({ hostId: req.user.id });
    const stats = {
        totalGames: results.length,
        totalPlayers: results.reduce((acc, r) => acc + r.totalPlayers, 0),
        avgAccuracy: results.reduce((acc, r) => acc + r.accuracyRate, 0) / results.length
    };
    res.json({ sessions: results, stats });
});
```

## Section 6: Frontend Auth JS (auth.js)
```javascript
async function handleLogin(e) {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password })
    });
    if (res.ok) window.location.href = 'dashboard.html';
    else showError(await res.json());
}
```

## Section 7: Chart.js Implementations
```javascript
// Accuracy Donut with Center Text Plugin
const centerText = {
    id: 'centerText',
    afterDraw: (chart) => {
        const { ctx, chartArea: { left, top, width, height } } = chart;
        ctx.save();
        ctx.font = 'bold 2rem Montserrat';
        ctx.textAlign = 'center';
        ctx.fillText(chart.data.datasets[0].data[0] + '%', left + width/2, top + height/2);
        ctx.restore();
    }
};
```

## Section 8: Export CSV Code
```javascript
function exportCSV(data) {
    const headers = ['Player', 'Score', 'Accuracy'];
    const rows = data.map(p => `${p.name},${p.score},${p.accuracy}%`);
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'results.csv';
    a.click();
}
```

## Section 9: Updated package.json
```json
"dependencies": {
    "bcryptjs": "^3.0.3",
    "cookie-parser": "^1.4.7",
    "express": "^4.21.0",
    "express-rate-limit": "^8.3.2",
    "express-validator": "^7.3.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.3",
    "mongoose": "^8.0.0",
    "socket.io": "^4.7.0"
}
```

## Section 10: Guest Mode Implementation
1. **Host Screen**: Show "Host as Guest" vs "Login to Save".
2. **Logic**: If not logged in, `createGame` event has `hostId_db = null`.
3. **End of Game**: If `hostId_db` is null, skip `saveGameResult`.
4. **UI**: Show banner: "Log in to see analytics and save your quiz!"

## Section 11: New Environment Variables
- `MONGODB_URI`: Connection string for Atlas.
- `JWT_SECRET`: 64-character random string.
- `CLIENT_URL`: URL of the app for CORS.

## Section 12: Step by Step Integration Plan
1. **DB**: Setup Atlas and add `MONGODB_URI` to `.env`.
2. **Models**: Create `User`, `Quiz`, `GameResult` models.
3. **Backend Auth**: Implement `routes/auth.js` and `middleware/auth.js`.
4. **Backend CRUD**: Implement `routes/quiz.js` and `routes/analytics.js`.
5. **UI**: Add `login.html`, `register.html`, `dashboard.html`.
6. **Frontend**: Connect forms to API and charts to analytics data.
7. **Socket**: Update `server.js` to trigger result saving on podium event.
