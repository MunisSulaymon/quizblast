# QuizBlast Bug Report

This audit was conducted by a Senior Full-Stack Developer & QA Engineer. The system was analyzed for architectural integrity, state synchronization, and UI/UX consistency.

## 🔴 CRITICAL BUGS (Breaks the game)
| File | Line | Problem | Impact |
| :--- | :--- | :--- | :--- |
| `server.js` | 98-110 | `startTimer` creates a new `setInterval` without clearing any existing `game.timer`. | Multiple intervals can run simultaneously if a question is skipped or advanced rapidly, causing erratic timer ticks and premature round ends. |
| `host.js` | N/A | Missing `socket.on('playerLeft')` listener. | Players who disconnect remain visible on the host's lobby and leaderboard list, leading to "ghost" players. |

## 🟡 MAJOR BUGS (Bad experience)
| File | Line | Problem | Impact |
| :--- | :--- | :--- | :--- |
| `host.js` | 117 | References `document.getElementById('streak-display')`. | This ID is missing in `host.html`, causing a console error when `showStreakBadge` is called. |
| `host.js` | 96-113 | Redundant `startAutoAdvanceCountdown` function. | Dead code that is never called. The actual countdown is handled by server-emitted socket events. |
| `server.js` | 210-223 | Missing server-side nickname validation. | While `player.js` validates, a user could bypass it and join with an invalid/offensive name if the `nicknameFilter` is off. |

## 🟢 MINOR BUGS (Small issues)
| File | Line | Problem | Impact |
| :--- | :--- | :--- | :--- |
| `server.js` | 171-189 | `createGame` does not check if the generated PIN is already in use. | Rare but possible PIN collision where a new game overwrites an active one. |
| `player.js` | 248-254 | `roomLockStatus` only logs to console. | Players don't get visual feedback if a room is locked until they try to join. |
| `host.js` | N/A | Missing `socket.on('errorMsg')`. | If the server sends an error to the host (e.g., during creation), the host won't know why it failed. |

## ⚠️ MISSING FEATURES (Referenced but not built)
- **Host Streak Display**: `host.js` has logic to show streaks, but `host.html` lacks the container.
- **Server-Side PIN Validation**: No check for active PINs during generation.
- **Lobby Player Removal**: No UI way for host to kick players or for list to update on leave.

## 💡 IMPROVEMENTS RECOMMENDED
- **PIN Collision Check**: Use a `do...while` loop in `server.js` to ensure PIN uniqueness.
- **Timer Sync**: Instead of just `timerTick`, send a `syncTimer` event occasionally to correct network lag.
- **State Protection**: Ensure `startGame` can only be called once.
- **Profanity Filter**: Expand the `badWords` array or use a library for better coverage.

## 📊 SOCKET EVENT AUDIT TABLE

| Event Name | Source | Target | Status | Note |
| :--- | :--- | :--- | :--- | :--- |
| `createGame` | Host | Server | ✅ | |
| `gameCreated` | Server | Host | ✅ | |
| `joinGame` | Player | Server | ✅ | |
| `joinedGame` | Server | Player | ✅ | |
| `errorMsg` | Server | Player | ✅ | |
| `startGame` | Host | Server | ✅ | |
| `lockRoom` | Host | Server | ✅ | |
| `roomLockStatus` | Server | Room | ⚠️ | Host doesn't listen; Player only logs. |
| `skipQuestion` | Host | Server | ✅ | |
| `nextQuestion` | Server | Room | ✅ | |
| `timerTick` | Server | Room | ✅ | |
| `submitAnswer` | Player | Server | ✅ | |
| `answerResult` | Server | Player | ✅ | |
| `playerAnswered` | Server | Host | ✅ | |
| `roundResults` | Server | Room | ✅ | |
| `autoAdvanceCountdown`| Server | Room | ✅ | |
| `podium` | Server | Room | ✅ | |
| `gameTerminated` | Server | Room | ✅ | |
| `playerLeft` | Server | Host | ❌ | **BUG**: Host has no listener. |

## ✅ THINGS THAT LOOK CORRECT
- **Security**: Correct answers are never sent to clients during the question phase.
- **Styling**: The CSS implementation for the settings sidebar and animations is robust.
- **Architecture**: The separation of concerns between Host and Player screens is well-handled.
- **Libraries**: Correct use of Howler.js, QRCode.js, and Canvas-Confetti.
