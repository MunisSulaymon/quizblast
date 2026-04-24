# QuizBlast Deep Bug Report

## SECTION 1: server.js — Line by Line Findings
- **Line 1**: `require('dotenv').config();` is present. ✅
- **Line 20**: `generatePIN()` is defined.
- **Line 17**: `const games = new Map();` is defined.
- **Line 61**: `startQuestion()` is defined.
- **Line 98**: `startTimer()` is defined.
- **Line 106**: `clearInterval(game.timer)` is called inside the interval. **BUG**: It is NOT called before creating a new `setInterval` on line 101. ❌
- **Line 113**: `endRound()` is defined.
- **Line 148**: `advanceGame()` is defined.
- **Line 153**: `game.players.forEach(p => { p.answered = false; });` resets answers. ✅
- **Lines 46-49**: `calculateScore` handles `none`, `standard`, and `double`. ✅
- **Line 213**: `if (game.locked)` check is present. ✅
- **Lines 220-223**: `nicknameFilter` logic is present. ✅
- **Lines 317-320**: Host cleanup logic is present. ✅
- **Lines 321-328**: Player cleanup logic is present. ✅
- **Line 81**: `pointsType` is sent in payload. ✅
- **Line 80**: `type` is sent in payload. ✅
- **Line 77**: `question` is sent conditionally. ✅
- **Line 86**: `doublePointsWarning` event is emitted. ✅
- **PIN Collision Check**: No (Uses `games.set` directly without checking `games.has`). ❌
- **startGame Guard**: No (Host can call multiple times during a round). ❌

## SECTION 2: host.js — Line by Line Findings
- **Line 3**: `globalQuestionsArray` initialized. ✅
- **Line 2**: `currentPin` initialized. ✅
- **Lines 8-15**: `goToScreen()` exists. ✅
- **Lines 27-39**: `collectSettings()` exists. ✅
- **Line 201**: `createGame()` sends settings. ✅
- **Lines 133-137**: `addQuestion()` creates settings object. ✅
- **Line 209**: `socket.on('gameCreated')` ✅
- **Line 227**: `socket.on('playerJoined')` ✅
- **Line 284**: `socket.on('roundResults')` ✅
- **Line 276**: `socket.on('timerTick')` ✅
- **Line 324**: `socket.on('podium')` ✅
- **Line N/A**: `socket.on('errorMsg')` ❌
- **Line 355**: `socket.on('gameTerminated')` ✅
- **Line N/A**: `socket.on('playerLeft')` ❌
- **Line 239**: `socket.on('doublePointsWarning')` ✅
- **Line 310**: `socket.on('autoAdvanceCountdown')` ✅
- **Line N/A**: `socket.on('roomLockStatus')` ❌
- **Timer Bar Update**: Handled in `nextQuestion` (265-271), NOT in `timerTick`.
- **Bar Chart**: Handled in `roundResults` (289-293). ✅
- **Confetti**: Handled in `podium` (337-342). ✅
- **Medals**: **Missing** in podium rendering (Lines 325-327). ❌
- **QR Code**: Handled in `gameCreated` (217-222). ✅
- **Player List**: Handled in `playerJoined` (228-231). ✅

## SECTION 3: player.js — Line by Line Findings
- **Line 3**: `myPin` initialized. ✅
- **Lines 9-14**: `goToScreen()` exists. ✅
- **Lines 140-150**: `submitAnswer()` exists. ✅
- **Double Submission**: Only UI-level disable (Line 145), no logic flag. ⚠️
- **Lines 124-138**: `renderQuizGrid()` exists. ✅
- **Lines 110-122**: `renderTrueFalse()` exists. ✅
- **Line 53**: `socket.on('joinedGame')` ✅
- **Line 67**: `socket.on('nextQuestion')` ✅
- **Line 152**: `socket.on('timerTick')` ✅
- **Line 160**: `socket.on('answerResult')` ✅
- **Line 197**: `socket.on('roundResults')` ✅
- **Line 219**: `socket.on('podium')` ✅
- **Line 60**: `socket.on('errorMsg')` ✅
- **Line 243**: `socket.on('gameTerminated')` ✅
- **Line N/A**: `socket.on('doublePointsWarning')` (Handled via `nextQuestion`). ✅
- **Line 209**: `socket.on('autoAdvanceCountdown')` ✅
- **Line 248**: `socket.on('roomLockStatus')` ✅
- **True/False Call**: Line 84. ✅
- **Quiz Grid Call**: Line 86. ✅
- **Timer Bar**: Handled in `nextQuestion` (99-105). ✅
- **Correct/Wrong**: Handled in `answerResult` (166-174). ✅
- **Points/Rank**: Handled in `answerResult` (176, 189). ✅
- **Top 3 Confetti**: Handled in `podium` (228-235). ✅

## SECTION 4: host.html — Missing IDs List
- `players-list` (Uses `lobby-player-list`)
- `streak-display` (**CRITICAL MISSING** - referenced in `host.js:117`)
- `answers-count` (Uses `p-answered`)
- `questions-container` (Uses `questions-list`)

## SECTION 5: join.html — Missing IDs List
- `timer-bar` (Uses `player-timer-bar`)
- `timer-number` (Uses `player-timer-num`)
- `feedback-correct` / `feedback-wrong` (Uses class-based `feedback-full`)
- `points-earned` (Uses `feedback-points`)
- `total-score` (Uses `total-score-val`)
- `player-rank` (Uses `rank-val`)
- `waiting-name` (Uses `display-name`)

## SECTION 6: style.css — Missing Classes List
- `.leaderboard-item` (Uses `.lb-item`)
- `.player-q-card` (Referenced in HTML, missing in CSS)
- `.podium` (Uses `.podium-container`)
- `.medal` (Missing)

## SECTION 7: Complete Bug List with exact fixes needed
1. **Timer Leak**: In `server.js:startTimer`, add `const game = games.get(pin); if(game.timer) clearInterval(game.timer);` before line 101.
2. **Ghost Players**: In `host.js`, add `socket.on('playerLeft', ({ name, count }) => { ... update UI ... });`.
3. **Missing ID Crash**: Add `<div id="streak-display" class="hidden"></div>` to `host.html` inside `question-screen`.
4. **PIN Collision**: In `server.js:createGame`, use a loop to ensure `generatePIN()` returns a unique PIN.
5. **Lock Sync**: In `player.js:roomLockStatus`, update a UI element (e.g., join button text) to show "🔒 Locked".

## SECTION 8: Complete list of missing HTML elements
- `host.html`: `streak-display` div.
- `join.html`: `player-rank` container (if intended separate from rank-val).
- `host.html`: Medal icons in podium places.

## SECTION 9: Complete socket event mismatch list
- `playerLeft`: Sent by server, ignored by host.
- `roomLockStatus`: Sent by server, ignored by host, only logged by player.
- `errorMsg`: Sent by server, ignored by host.

## SECTION 10: Priority fix order (fix this first)
1. **Timer Leak** (`server.js`) - Prevents game crashes and erratic behavior.
2. **Missing ID Crash** (`host.html`) - Prevents host JS from breaking.
3. **Player Disconnect Sync** (`host.js`) - Fixes the "ghost player" issue.
4. **PIN Collision Check** (`server.js`) - Ensures game reliability.
5. **Nickname Validation** (`server.js`) - Ensures security.
