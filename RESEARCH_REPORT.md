# Deep Research Report: QuizBlast (Kahoot Clone)

This report provides a production-ready architectural and technical blueprint based on deep research into existing clones, workshops, and 2025/2026 best practices.

## 1. GitHub Repository Analysis & Code Snippets

### A. gan-h/kahoot (Core Logic Reference)
*   **Unique Logic**: Separation of `Host` and `Client` logic via specific socket rooms.
*   **Exact Event Names**:
    *   `createRoom` / `roomCreated`: Host initializes a session.
    *   `joinRoom` / `joined`: Player enters room with PIN.
    *   `beginRound`: Host triggers question display.
    *   `answer`: Player submits choice.
    *   `userAnswered`: Server notifies Host of progress.
    *   `roundEnd`: Server calculates and broadcasts results.

### B. ethanbrimhall/kahoot-clone-nodejs (Architecture)
*   **File Structure**:
    ```text
    ├── server/
    │   ├── server.js (Socket.io & Express Setup)
    │   └── gameData.json (Mock Questions)
    ├── public/
    │   ├── host/ (Host UI)
    │   └── player/ (Player UI)
    ```
*   **Game State Machine**:
    ```javascript
    // Simplified State Logic
    let gameLive = false;
    let playersAnswered = 0;
    let currentQuestion = 0;
    // States: LOBBY -> LIVE -> QUESTION_OVER -> LEADERBOARD -> GAME_OVER
    ```

### C. Exact Code Implementations

**PIN Generation (Node.js):**
```javascript
const crypto = require('crypto');
function generatePIN() {
  return crypto.randomInt(100000, 999999).toString();
}
```

**Scoring Calculation Logic:**
```javascript
// Points based on accuracy and speed
function calculateScore(timeTaken, totalTime, isCorrect) {
  if (!isCorrect) return 0;
  const basePoints = 1000;
  // Score = 1000 * (1 - ((timeTaken / totalTime) / 2))
  const score = Math.round(basePoints * (1 - ((timeTaken / totalTime) / 2)));
  return score;
}
```

## 2. Technical Specifications

### A. MongoDB Schema (Mongoose)
```javascript
const QuizSchema = new mongoose.Schema({
  title: String,
  creatorId: String,
  questions: [{
    question: String,
    answers: [String],
    correctIndex: Number,
    timeLimit: { type: Number, default: 20 }
  }]
});

const GameSessionSchema = new mongoose.Schema({
  pin: { type: String, unique: true },
  hostSocketId: String,
  quizId: mongoose.Schema.Types.ObjectId,
  players: [{
    socketId: String,
    name: String,
    score: { type: Number, default: 0 },
    streak: { type: Number, default: 0 }
  }],
  currentState: { type: String, enum: ['LOBBY', 'QUESTION', 'SCOREBOARD'], default: 'LOBBY' }
});
```

### B. Redis Session Structure
For high-performance real-time state:
*   `game:{pin}:state` -> `JSON string of GameSession`
*   `game:{pin}:players` -> `Set of socket IDs`
*   `player:{socketId}:data` -> `Hash { name, score, roomId }`

### C. Package Versions (2026 Stable)
*   `express`: `^5.0.0`
*   `socket.io`: `^4.8.1`
*   `socket.io-client`: `^4.8.1`
*   `cors`: `^2.8.5`
*   `canvas-confetti`: `^1.9.3`
*   `mongoose`: `^8.0.0`

## 3. Design & UI Decisions

### A. Color Palette (Kahoot Exact)
*   **Primary Purple**: `#46178F`
*   **Red (Triangle)**: `#FF3355`
*   **Blue (Diamond)**: `#1368CE`
*   **Yellow (Circle)**: `#D89E00`
*   **Green (Square)**: `#26890C`
*   **Background Grey**: `#F2F2F2`

### B. Typography & Font Pairing
*   **Headlines/Timer**: [Orbitron](https://fonts.google.com/specimen/Orbitron) (700 weight) - Futuristic/Gaming look.
*   **Body/Answers**: [Montserrat](https://fonts.google.com/specimen/Montserrat) (500 weight) - High readability on mobile.

### C. QR Code Implementation
```html
<script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"></script>
<div id="qrcode"></div>
<script>
  new QRCode(document.getElementById("qrcode"), {
    text: `https://quizblast.app/join?pin=${gamePin}`,
    width: 128,
    height: 128
  });
</script>
```

## 4. Game Reliability & Scaling

### A. Player Disconnection Handling
```javascript
socket.on('disconnect', () => {
  const player = findPlayerBySocket(socket.id);
  if (player) {
    io.to(player.room).emit('playerLeft', { id: socket.id, name: player.name });
    removePlayerFromState(socket.id);
  }
  // Cleanup empty rooms
  if (isHost(socket.id)) {
    closeRoom(getRoomByHost(socket.id));
  }
});
```

### B. Anti-Cheat Validation
1.  **Server-side Timestamps**: Record `questionStartTime` on server; ignore any `answer` event received after `startTime + timeLimit + 1000ms`.
2.  **State Gating**: Only process `answer` events if `room.state === 'QUESTION'`.
3.  **No Leaks**: Don't send `correctIndex` to players until `roundEnd` event.

## 5. Deployment Recommendation

### Best Platform: Railway or Render
*   **Why**: Supports long-lived HTTP connections required by WebSockets.
*   **Vercel Note**: Standard Socket.io will **not** work on Vercel due to serverless execution timeouts.

**Deployment Steps**:
1.  Initialize Git repo.
2.  Add `PORT` environment variable.
3.  Configure CORS:
    ```javascript
    const io = new Server(server, {
      cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] }
    });
    ```
4.  Connect GitHub to Railway/Render for Auto-deploy.

## 6. Common Pitfalls to Avoid
*   **Memory Leaks**: Always `clearInterval()` for the question timer when a round ends.
*   **Event Doubling**: Avoid `socket.on` inside other `socket.on` blocks.
*   **Scaling**: If using multiple server instances, you **MUST** use the `@socket.io/redis-adapter` to synchronize room events across instances.

## 7. Complete server.js Skeleton

```javascript
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// In-memory Game State
const games = new Map(); // RoomPIN -> GameState

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createGame', (quizData) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    games.set(pin, {
      hostId: socket.id,
      players: new Map(),
      questions: quizData.questions,
      currentQuestion: 0,
      state: 'LOBBY',
      timer: null
    });
    socket.join(pin);
    socket.emit('gameCreated', { pin });
  });

  socket.on('joinGame', ({ pin, name }) => {
    const game = games.get(pin);
    if (!game) return socket.emit('error', 'Game not found');
    if (game.state !== 'LOBBY') return socket.emit('error', 'Game already started');
    
    game.players.set(socket.id, { name, score: 0, streak: 0, lastCorrect: false });
    socket.join(pin);
    io.to(pin).emit('playerJoined', Array.from(game.players.values()));
  });

  socket.on('startGame', (pin) => {
    const game = games.get(pin);
    if (game && game.hostId === socket.id) {
      game.state = 'QUESTION';
      startQuestion(pin);
    }
  });

  // Handle answers and disconnection cleanup...
});

httpServer.listen(3000, () => console.log('Server running on port 3000'));
```

## 8. Full Socket Event Flow Table

| Sequence | Event | Emitter | Payload | Receivers | Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `createGame` | Host | `quizData` | Server | Generates PIN, creates room. |
| 2 | `joinGame` | Player | `{pin, name}` | Server | Adds player to room state. |
| 3 | `playerJoined`| Server | `playerList` | Host + Room | Updates lobby display. |
| 4 | `startGame` | Host | `pin` | Server | Transitions to first question. |
| 5 | `nextQuestion`| Server | `questionData` | Room | Shows question UI on all devices. |
| 6 | `submitAnswer`| Player | `{index, time}` | Server | Validates answer, updates score. |
| 7 | `timerTick` | Server | `{timeLeft}` | Room | Updates countdown UI. |
| 8 | `roundResults`| Server | `stats, results`| Room | Shows bar chart and correct answer. |
| 9 | `leaderboard` | Server | `topPlayers` | Room | Shows rankings between rounds. |
| 10| `podium` | Server | `winners` | Room | Final results and confetti. |

## 9. Server-side Timer Exact Code

```javascript
function startQuestion(pin) {
  const game = games.get(pin);
  let timeLeft = 20; // Seconds
  
  io.to(pin).emit('nextQuestion', { 
    question: game.questions[game.currentQuestion], 
    timeLimit: timeLeft 
  });

  game.timer = setInterval(() => {
    timeLeft--;
    io.to(pin).emit('timerTick', timeLeft);

    if (timeLeft <= 0 || allPlayersAnswered(game)) {
      clearInterval(game.timer);
      endRound(pin);
    }
  }, 1000);
}

function allPlayersAnswered(game) {
  return game.answersReceived >= game.players.size;
}
```

## 10. Frontend State Machine Pattern

```javascript
const screens = {
  join: document.getElementById('join-screen'),
  lobby: document.getElementById('lobby-screen'),
  question: document.getElementById('question-screen'),
  feedback: document.getElementById('feedback-screen'),
  leaderboard: document.getElementById('leaderboard-screen'),
  podium: document.getElementById('podium-screen')
};

function goToScreen(target) {
  Object.keys(screens).forEach(key => {
    screens[key].classList.toggle('hidden', key !== target);
  });
}

// Usage:
socket.on('nextQuestion', (data) => {
  renderQuestion(data);
  goToScreen('question');
});
```

## 11. Streak Bonus Exact Code

```javascript
function processAnswer(game, playerId, answerIndex, timeTaken) {
  const player = game.players.get(playerId);
  const question = game.questions[game.currentQuestion];
  const isCorrect = answerIndex === question.correctIndex;

  if (isCorrect) {
    player.streak++;
    let multiplier = 1.0;
    if (player.streak >= 10) multiplier = 1.5;
    else if (player.streak >= 5) multiplier = 1.2;
    else if (player.streak >= 3) multiplier = 1.1;

    const basePoints = calculateScore(timeTaken, question.timeLimit, true);
    player.score += Math.round(basePoints * multiplier);
  } else {
    player.streak = 0;
  }
}
```

## 12. Bar Chart Implementation (CSS Flexbox)

```html
<!-- Host view results -->
<div class="results-chart">
  <div class="bar-container">
    <div id="bar-0" class="bar red" style="height: 0%"></div>
    <div id="bar-1" class="bar blue" style="height: 0%"></div>
    <div id="bar-2" class="bar yellow" style="height: 0%"></div>
    <div id="bar-3" class="bar green" style="height: 0%"></div>
  </div>
</div>

<style>
.bar-container { display: flex; align-items: flex-end; height: 300px; gap: 10px; }
.bar { flex: 1; transition: height 0.5s ease-out; }
.red { background: #FF3355; }
</style>
```

## 13. Confetti Exact Code

**CDN Tag:**
`<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>`

**Trigger Rain for 3 Seconds:**
```javascript
const end = Date.now() + 3000;

(function frame() {
  confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
  confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
  if (Date.now() < end) requestAnimationFrame(frame);
}());
```

## 14. Error Handling for Edge Cases

```javascript
// Server-side
socket.on('joinGame', (pin, name) => {
  const game = games.get(pin);
  // Case 1: Wrong PIN
  if (!game) return socket.emit('errorMsg', 'Invalid PIN code.');
  // Case 2: Game Started
  if (game.state !== 'LOBBY') return socket.emit('errorMsg', 'Game already in progress.');
  // Case 3: Name Collision
  const nameExists = Array.from(game.players.values()).some(p => p.name === name);
  if (nameExists) return socket.emit('errorMsg', 'Nickname already taken.');
});

// Case 4: Host Disconnect
socket.on('disconnect', () => {
  if (isHost(socket.id)) {
    const pin = findPinByHost(socket.id);
    io.to(pin).emit('gameTerminated', 'Host has disconnected.');
    games.delete(pin);
  }
});
```

## 15. CSS Animations Code Snippets

```css
/* Progress Bar Countdown */
.timer-bar {
  height: 10px;
  background: #1368CE;
  width: 100%;
  transition: width 1s linear;
}

/* Button Pulse Effect */
.btn-answer:hover {
  animation: pulse 0.5s infinite alternate;
}
@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.05); }
}

/* Leaderboard Slide-in */
.lb-item {
  animation: slideIn 0.5s ease-out forwards;
  opacity: 0;
}
@keyframes slideIn {
  from { transform: translateX(50px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

## 16. Complete package.json

```json
{
  "name": "quizblast-server",
  "version": "1.0.0",
  "main": "server.js",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "echo 'No build step needed for Node backend'"
  },
  "dependencies": {
    "express": "^5.0.0",
    "socket.io": "^4.8.1",
    "cors": "^2.8.5",
    "mongoose": "^8.0.0",
    "canvas-confetti": "^1.9.3"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```
