# QuizBlast Host Login & Analytics Research Report

This document outlines the architectural blueprint and technical research for implementing a Host Authentication system and a Post-Game Analytics dashboard for QuizBlast.

## 1. Auth Strategy Decision: JWT vs Session
**Decision: JWT (JSON Web Tokens) with HttpOnly Cookies**
- **Pros:** Stateless (no server-side session storage needed), scales easily, works well with decoupled frontends, can be stored securely in `HttpOnly` cookies to prevent XSS.
- **Cons:** Harder to invalidate before expiry (requires a blacklist or short TTL), requires CSRF protection if using cookies.
- **2025 Best Practice:** Use short-lived Access Tokens (5-15m) and long-lived Refresh Tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

## 2. Complete User Schema (Mongoose)
```javascript
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }, // Hashed with bcrypt
  quizzes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }],
  createdAt: { type: Date, default: Date.now }
});
```

## 3. Complete Quiz Schema (Mongoose)
```javascript
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
```

## 4. Complete GameResult Schema (Mongoose)
```javascript
const gameResultSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  playedAt: { type: Date, default: Date.now },
  totalPlayers: Number,
  avgScore: Number,
  accuracyRate: Number, // (Total Correct / Total Answers) * 100
  players: [{
    name: String,
    score: Number,
    rank: Number,
    accuracy: Number,
    answers: [{
      questionIndex: Number,
      isCorrect: Boolean,
      timeTaken: Number
    }]
  }],
  questionStats: [{
    questionIndex: Number,
    totalCorrect: Number,
    avgResponseTime: Number,
    difficultyRating: String // Easy/Medium/Hard based on % correct
  }]
});
```

## 5. REST API Endpoints Needed
### Auth
- `POST /api/auth/register`: Create new host account.
- `POST /api/auth/login`: Authenticate and return JWT in cookie.
- `POST /api/auth/logout`: Clear auth cookie.
- `GET /api/auth/me`: Get current host profile (protected).

### Quizzes
- `GET /api/quizzes`: List all quizzes for the logged-in host.
- `POST /api/quizzes`: Save a new quiz.
- `GET /api/quizzes/:id`: Load specific quiz data.
- `PUT /api/quizzes/:id`: Update an existing quiz.
- `DELETE /api/quizzes/:id`: Delete a quiz.

### Analytics
- `GET /api/analytics`: List all past game sessions.
- `GET /api/analytics/:id`: Get deep analytics for a specific session.
- `POST /api/analytics`: Internal endpoint to save results at game end.

## 6. JWT Implementation Complete Code
```javascript
// Generation (Login)
const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });

// Verification Middleware
const auth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
```

## 7. bcrypt Password Code
```javascript
// Hashing (Register)
const salt = await bcrypt.genSalt(10);
user.password = await bcrypt.hash(password, salt);

// Comparison (Login)
const isMatch = await bcrypt.compare(password, user.password);
```

## 8. Protected Route Middleware
```javascript
// Usage in Express
router.get('/my-quizzes', auth, async (req, res) => {
  const quizzes = await Quiz.find({ hostId: req.user });
  res.json(quizzes);
});
```

## 9. Analytics Metrics to Track
- **Engagement:** Total players, completion rate (who stayed until the end).
- **Performance:** High score, class average, distribution of scores (histogram).
- **Difficulty:** "Hardest Question" (lowest % correct), "Easiest Question" (highest % correct).
- **Speed:** Fastest responder, average response time per question.

## 10. Chart.js Examples
### Accuracy Pie Chart
```javascript
new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: ['Correct', 'Incorrect'],
    datasets: [{ data: [correctCount, incorrectCount], backgroundColor: ['#26890C', '#FF3355'] }]
  }
});
```
### Score Bar Chart
```javascript
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: playerNames,
    datasets: [{ label: 'Score', data: playerScores, backgroundColor: '#1368CE' }]
  }
});
```

## 11. Dashboard UI Design Plan
- **Summary Row:** 4 Cards (Avg Score, Total Players, Accuracy %, Hardest Q).
- **Main View:** Split screen - Left (Score Leaderboard Bar Chart), Right (Accuracy Donut).
- **Detail View:** Table of Questions with "Correct %" and "Avg Time" columns.
- **Color Palette:** QuizBlast brand colors (Purple, Blue, Green, Red).

## 12. MongoDB Atlas Setup Steps
1. Sign up at [mongodb.com](https://www.mongodb.com/).
2. Create a Free Cluster (M0).
3. Under "Network Access", add `0.0.0.0/0` (whitelist all for Render).
4. Under "Database Access", create a user with a strong password.
5. Click "Connect" -> "Connect your application" -> Copy the URI.
6. Add `MONGODB_URI` to Render Environment Variables.

## 13. Security Measures List
- **Rate Limiting:** `express-rate-limit` on `/api/auth/` routes (max 5 per 15m).
- **Helmet:** `app.use(helmet())` for secure HTTP headers.
- **CORS:** Restrict origins to `CLIENT_URL` in production.
- **Sanitization:** Use Mongoose to prevent NoSQL injection.
- **Secrets:** Use `process.env.JWT_SECRET` and change it in production.

## 14. New Files Needed
- `models/User.js`: Mongoose user model.
- `models/Quiz.js`: Mongoose quiz model.
- `models/GameResult.js`: Mongoose analytics model.
- `routes/auth.js`: Registration, Login, Logout logic.
- `routes/quiz.js`: CRUD for quizzes.
- `routes/analytics.js`: Fetching game results.
- `middleware/auth.js`: JWT verification.
- `public/dashboard.html` & `public/dashboard.js`: Analytics UI.

## 15. Changes Needed to Existing Files
- `server.js`: Integrate Mongoose, routes, and `saveResult` logic in `podium` event.
- `host.js`: Add "Save Quiz" button logic and "View Results" navigation.
- `host.html`: Add login/register modals/screens.

## 16. Environment Variables Needed
- `PORT`: Server port (default 3000).
- `MONGODB_URI`: Atlas connection string.
- `JWT_SECRET`: Random string for signing tokens.
- `NODE_ENV`: 'development' or 'production'.
