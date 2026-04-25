const socket = io();
let currentPin = null;
let globalQuestionsArray = [];
let currentTimeLimit = 20;
let savedQuizId = null;

// DOM Elements
const screens = ['builder-screen', 'lobby-screen', 'question-screen', 'results-screen', 'podium-screen'];

function goToScreen(targetId) {
  screens.forEach(id => {
    document.getElementById(id).classList.toggle('active', id === targetId);
  });
  // Show settings gear only on builder and lobby
  const gear = document.getElementById('settings-toggle-btn');
  if (gear) {
    gear.style.display = (targetId === 'builder-screen' || targetId === 'lobby-screen') ? 'block' : 'none';
  }
}

window.onload = () => {
  // Check if loading a saved quiz
  const loadedQuiz = localStorage.getItem('loadedQuiz');
  const editQuiz = localStorage.getItem('editQuiz');

  if (loadedQuiz) {
    const quiz = JSON.parse(loadedQuiz);
    localStorage.removeItem('loadedQuiz');
    loadQuizIntoGame(quiz);
  } else if (editQuiz) {
    const quiz = JSON.parse(editQuiz);
    localStorage.removeItem('editQuiz');
    savedQuizId = quiz._id;
    loadQuizIntoBuilder(quiz);
  }
};

function loadQuizIntoGame(quiz) {
  // Load quiz data and go directly to lobby
  document.getElementById('quiz-title').value = quiz.title;
  globalQuestionsArray = quiz.questions;
  savedQuizId = quiz._id;
  createGame(); // Auto-start game with loaded quiz
}

function loadQuizIntoBuilder(quiz) {
  // Load quiz into builder for editing
  document.getElementById('quiz-title').value = quiz.title;
  globalQuestionsArray = [];
  const container = document.getElementById('questions-list');
  if (container) container.innerHTML = '';
  quiz.questions.forEach((q, i) => {
    globalQuestionsArray.push(q);
    renderQuestionCard(q, i);
  });
}

function renderQuestionCard(q, idx) {
  const card = document.createElement('div');
  card.className = 'question-card builder-card';
  card.style.marginTop = '1rem';
  card.innerHTML = `
    <div class="q-header" style="font-weight: 700; margin-bottom: 0.5rem;">Question ${idx + 1}</div>
    <input type="text" placeholder="Enter question..." 
      value="${q.question}"
      oninput="globalQuestionsArray[${idx}].question=this.value" style="margin-bottom: 1rem;">
    <div class="answers-grid">
      ${['A', 'B', 'C', 'D'].map((l, i) => `
        <div class="answer-row" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input type="radio" name="correct-${idx}" 
            value="${i}" ${i === q.correctIndex ? 'checked' : ''} 
            onchange="globalQuestionsArray[${idx}].correctIndex=${i}" style="width: auto;">
          <input type="text" placeholder="Answer ${l}..."
            value="${q.answers[i] || ''}"
            oninput="globalQuestionsArray[${idx}].answers[${i}]=this.value">
        </div>
      `).join('')}
    </div>
    <details>
      <summary>⚙️ Question Settings</summary>
      <div class="q-settings-grid">
        <select onchange="globalQuestionsArray[${idx}].settings.timeLimit=+this.value">
          <option value="10" ${q.settings?.timeLimit === 10 ? 'selected' : ''}>10s</option>
          <option value="20" ${q.settings?.timeLimit === 20 || !q.settings?.timeLimit ? 'selected' : ''}>20s</option>
          <option value="30" ${q.settings?.timeLimit === 30 ? 'selected' : ''}>30s</option>
          <option value="60" ${q.settings?.timeLimit === 60 ? 'selected' : ''}>60s</option>
        </select>
        <select onchange="globalQuestionsArray[${idx}].settings.pointsType=this.value">
          <option value="standard" ${q.settings?.pointsType === 'standard' ? 'selected' : ''}>⭐ Standard</option>
          <option value="double" ${q.settings?.pointsType === 'double' ? 'selected' : ''}>🔥 Double</option>
          <option value="none" ${q.settings?.pointsType === 'none' ? 'selected' : ''}>🚫 No Points</option>
        </select>
        <select onchange="globalQuestionsArray[${idx}].settings.questionType=this.value">
          <option value="quiz" ${q.settings?.questionType === 'quiz' ? 'selected' : ''}>📝 Quiz</option>
          <option value="true-false" ${q.settings?.questionType === 'true-false' ? 'selected' : ''}>✅ True/False</option>
          <option value="poll" ${q.settings?.questionType === 'poll' ? 'selected' : ''}>📊 Poll</option>
        </select>
      </div>
    </details>
  `;
  document.getElementById('questions-list').appendChild(card);
}

function showError(msg) {
  alert(msg);
}

/* ---- SETTINGS PANEL ---- */
function toggleSettings() {
  document.getElementById('settings-panel').classList.toggle('active');
  document.getElementById('settings-overlay').classList.toggle('active');
}

function collectSettings() {
  const form = document.getElementById('settings-form');
  const fd = new FormData(form);
  return {
    randomizeQuestions: fd.get('randomizeQuestions') === 'on',
    randomizeAnswers: fd.get('randomizeAnswers') === 'on',
    showQuestionOnDevice: fd.get('showQuestionOnDevice') === 'on',
    autoPlay: fd.get('autoPlay') === 'on',
    lobbyMusic: fd.get('lobbyMusic') || 'classic',
    nicknameFilter: fd.get('nicknameFilter') === 'on',
    locked: false
  };
}

/* ---- MUSIC (Howler.js) ---- */
let bgMusic = null;

function startLobbyMusic(track) {
  if (bgMusic) bgMusic.stop();
  if (track === 'off') return;

  const tracks = {
    classic: 'https://actions.google.com/sounds/v1/science_fiction/techno_suspense.ogg',
    disco: 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg',
    chill: 'https://actions.google.com/sounds/v1/ambient/meditation_bowl_struck.ogg'
  };

  bgMusic = new Howl({
    src: [tracks[track] || tracks.classic],
    loop: true,
    volume: 0.4
  });
  bgMusic.play();
}

function toggleMute() {
  const btn = document.getElementById('mute-btn');
  if (bgMusic) {
    const isMuted = !bgMusic.muted();
    bgMusic.muted(isMuted);
    btn.textContent = isMuted ? '🔇' : '🔊';
  }
}

/* ---- DOUBLE POINTS ANNOUNCEMENT ---- */
function showDoublePointsAnnouncement() {
  const div = document.createElement('div');
  div.className = 'announcement-overlay';
  div.innerHTML = '<h1>🔥 DOUBLE POINTS! 🔥</h1>';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2500);
}

/* ---- LOCK ROOM ---- */
let roomLocked = false;
function toggleLock() {
  roomLocked = !roomLocked;
  socket.emit('lockRoom', { pin: currentPin, locked: roomLocked });
  const btn = document.getElementById('lock-btn');
  btn.textContent = roomLocked ? '🔒 Locked' : '🔓 Unlocked';
  btn.classList.toggle('locked', roomLocked);
}

/* ---- SKIP QUESTION ---- */
function skipQuestion() {
  socket.emit('skipQuestion', currentPin);
}

/* ---- AUTO-PLAY COUNTDOWN ---- */
function startAutoAdvanceCountdown(pin) {
  let count = 5;
  const bar = document.getElementById('auto-advance-bar');
  bar.classList.remove('hidden');
  bar.textContent = `Next question in ${count}...`;

  const interval = setInterval(() => {
    count--;
    if (count >= 0) {
      bar.textContent = `Next question in ${count}...`;
    }
    if (count < 0) {
      clearInterval(interval);
      bar.classList.add('hidden');
      socket.emit('nextQuestion', pin);
    }
  }, 1000);
}

/* ---- ON FIRE STREAK ---- */
function showStreakBadge(streak) {
  const el = document.getElementById('streak-display');
  if (streak >= 3) {
    el.innerHTML = `<span class="streak-badge">🔥 ${streak} Streak!</span>`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function showNotification(msg) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ---- BUILDER LOGIC ---- */
function addQuestion() {
  const idx = globalQuestionsArray.length;
  globalQuestionsArray.push({
    question: '',
    answers: ['', '', '', ''],
    correctIndex: 0,
    settings: {
      timeLimit: 20,
      pointsType: 'standard',
      questionType: 'quiz'
    }
  });

  const card = document.createElement('div');
  card.className = 'question-card builder-card';
  card.style.marginTop = '1rem';
  card.innerHTML = `
    <div class="q-header" style="font-weight: 700; margin-bottom: 0.5rem;">Question ${idx + 1}</div>
    <input type="text" placeholder="Enter question..." 
      oninput="globalQuestionsArray[${idx}].question=this.value" style="margin-bottom: 1rem;">
    <div class="answers-grid">
      ${['A', 'B', 'C', 'D'].map((l, i) => `
        <div class="answer-row" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input type="radio" name="correct-${idx}" 
            value="${i}" ${i === 0 ? 'checked' : ''} 
            onchange="globalQuestionsArray[${idx}].correctIndex=${i}" style="width: auto;">
          <input type="text" placeholder="Answer ${l}..."
            oninput="globalQuestionsArray[${idx}].answers[${i}]=this.value">
        </div>
      `).join('')}
    </div>
    <details>
      <summary>⚙️ Question Settings</summary>
      <div class="q-settings-grid">
        <select onchange="globalQuestionsArray[${idx}].settings.timeLimit=+this.value">
          <option value="10">10s</option>
          <option value="20" selected>20s</option>
          <option value="30">30s</option>
          <option value="60">60s</option>
        </select>
        <select onchange="globalQuestionsArray[${idx}].settings.pointsType=this.value">
          <option value="standard">⭐ Standard</option>
          <option value="double">🔥 Double</option>
          <option value="none">🚫 No Points</option>
        </select>
        <select onchange="globalQuestionsArray[${idx}].settings.questionType=this.value">
          <option value="quiz">📝 Quiz</option>
          <option value="true-false">✅ True/False</option>
          <option value="poll">📊 Poll</option>
        </select>
      </div>
    </details>
  `;
  document.getElementById('questions-list').appendChild(card);
  updateCreateBtn();
}

document.getElementById('add-q-btn').addEventListener('click', addQuestion);

function updateCreateBtn() {
  const title = document.getElementById('quiz-title').value.trim();
  document.getElementById('create-game-btn').disabled = !(title && globalQuestionsArray.length > 0);
}

document.getElementById('quiz-title').addEventListener('input', updateCreateBtn);

// Update createGame to send auth info and save quiz
async function createGame() {
  const title = document.getElementById('quiz-title').value.trim();
  if (!title) return showNotification('Please enter a quiz title');
  if (globalQuestionsArray.length === 0) 
    return showNotification('Add at least one question');

  // Check if logged in
  let hostId_db = null;
  let quizId_db = savedQuizId;
  
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      hostId_db = user._id;
      
      // Save quiz to database if logged in
      if (!savedQuizId) {
        // Save NEW quiz
        const saveRes = await fetch('/api/quizzes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            questions: globalQuestionsArray,
            settings: collectSettings()
          })
        });
        if (saveRes.ok) {
          const saved = await saveRes.json();
          quizId_db = saved._id;
          savedQuizId = saved._id;
          showNotification('Quiz saved! ✓');
        }
      } else {
        // UPDATE existing quiz
        const updateRes = await fetch(`/api/quizzes/${savedQuizId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            questions: globalQuestionsArray,
            settings: collectSettings()
          })
        });
        if (updateRes.ok) {
          quizId_db = savedQuizId;
          showNotification('Quiz updated! ✓');
        }
      }
    }
  } catch (e) {
    // Guest mode - continue without saving
  }

  const quizData = {
    title,
    questions: globalQuestionsArray,
    settings: collectSettings(),
    hostId_db,
    quizId_db
  };
  socket.emit('createGame', quizData);
}

document.getElementById('create-game-btn').addEventListener('click', createGame);

/* ---- SOCKET LISTENERS ---- */
socket.on('gameCreated', ({ pin }) => {
  currentPin = pin;
  document.getElementById('pin-display').textContent = pin;
  
  const settings = collectSettings();
  startLobbyMusic(settings.lobbyMusic);

  // Generate QR Code
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById("qrcode"), {
    text: `${window.location.origin}/join.html?pin=${pin}`,
    width: 150,
    height: 150
  });

  goToScreen('lobby-screen');
});

socket.on('playerJoined', ({ players, count }) => {
  document.getElementById('player-count').innerText = `${count} players joined`;
  document.getElementById('lobby-player-list').innerHTML = players.map(name => `
    <div class="player-tag player-item">${name}</div>
  `).join('');
  document.getElementById('start-game-btn').disabled = count === 0;
});

socket.on('playerLeft', ({ name, count }) => {
  document.getElementById('player-count').innerText = `${count} players joined`;
  const playerList = document.getElementById('lobby-player-list');
  if (playerList) {
    const items = playerList.querySelectorAll('.player-item');
    items.forEach(item => {
      if (item.textContent.trim() === name) {
        item.remove();
      }
    });
  }
  showNotification(`${name} left the game`);
});

socket.on('errorMsg', (msg) => {
  const errDiv = document.getElementById('host-error-msg');
  if (errDiv) {
    errDiv.textContent = msg;
    errDiv.classList.remove('hidden');
    setTimeout(() => errDiv.classList.add('hidden'), 3000);
  } else {
    alert('Error: ' + msg);
  }
});

socket.on('roomLockStatus', (locked) => {
  const btn = document.getElementById('lock-btn');
  if (btn) {
    btn.textContent = locked ? '🔒 Locked' : '🔓 Unlocked';
    btn.classList.toggle('locked', locked);
  }
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('startGame', currentPin);
});

socket.on('doublePointsWarning', () => {
    showDoublePointsAnnouncement();
});

socket.on('nextQuestion', ({ questionIndex, totalQuestions, question, answers, timeLimit, type, pointsType }) => {
  currentTimeLimit = timeLimit;
  document.getElementById('q-progress').innerText = `Question ${questionIndex + 1} of ${totalQuestions}`;
  document.getElementById('host-question-text').innerText = question || 'Look at your device!';
  
  const grid = document.getElementById('host-answers-grid');
  if (type === 'true-false') {
      grid.innerHTML = `
        <div class="answer-panel blue" style="grid-column: span 2;"><span class="shape-icon">✅</span> <span>TRUE</span></div>
        <div class="answer-panel red" style="grid-column: span 2;"><span class="shape-icon">❌</span> <span>FALSE</span></div>
      `;
  } else {
      grid.innerHTML = `
        <div class="answer-panel red"><span class="shape-icon">▲</span> <span id="ans-text-0">${answers[0]}</span></div>
        <div class="answer-panel blue"><span class="shape-icon">◆</span> <span id="ans-text-1">${answers[1]}</span></div>
        <div class="answer-panel yellow"><span class="shape-icon">●</span> <span id="ans-text-2">${answers[2]}</span></div>
        <div class="answer-panel green"><span class="shape-icon">■</span> <span id="ans-text-3">${answers[3]}</span></div>
      `;
  }

  document.getElementById('p-answered').innerText = `0 / ${document.getElementById('lobby-player-list').children.length} Answered`;

  // Reset Timer Bar
  const timerBar = document.getElementById('timer-bar');
  timerBar.style.width = '100%';
  timerBar.style.transition = 'none';
  timerBar.style.background = '#1368CE';
  setTimeout(() => {
    timerBar.style.transition = `width ${timeLimit}s linear`;
    timerBar.style.width = '0%';
  }, 50);

  goToScreen('question-screen');
});

socket.on('timerTick', (timeLeft) => {
  document.getElementById('host-timer-num').innerText = timeLeft;
  
  const bar = document.getElementById('timer-bar');
  if (bar && currentTimeLimit) {
    const pct = (timeLeft / currentTimeLimit) * 100;
    // Bar width is mostly handled by CSS transition, but we sync color here
    if (pct < 30) bar.style.background = '#eb1727';
    else if (pct < 60) bar.style.background = '#D89E00';
    else bar.style.background = '#1368CE';
  }
});

socket.on('playerAnswered', ({ count, total }) => {
  document.getElementById('p-answered').innerText = `${count} / ${total} Answered`;
});

socket.on('roundResults', ({ correctIndex, correctAnswer, answerCounts, leaderboard, allPlayers }) => {
  document.getElementById('res-correct-text').innerText = correctAnswer;

  // Update Bar Chart
  const totalAnswers = answerCounts.reduce((a, b) => a + b, 0) || 1;
  answerCounts.forEach((count, i) => {
    const height = (count / totalAnswers) * 100;
    const bar = document.getElementById(`bar-${i}`);
    if (bar) bar.style.height = `${height}%`;
  });

  // Update Leaderboard
  document.getElementById('results-leaderboard').innerHTML = leaderboard.map(p => `
    <div class="lb-item">
      <span>#${p.rank} ${p.name}</span>
      <span>${p.score} pts</span>
    </div>
  `).join('');

  const currentQNum = parseInt(document.getElementById('q-progress').innerText.split(' ')[1]);
  const isLast = globalQuestionsArray.length === currentQNum;
  document.getElementById('next-q-btn').innerText = isLast ? '🏆 See Final Results' : '⏭️ Next Question';

  goToScreen('results-screen');
});

socket.on('autoAdvanceCountdown', (seconds) => {
  const bar = document.getElementById('auto-advance-bar');
  bar.textContent = `Next question in ${seconds}...`;
  bar.classList.remove('hidden');
});

socket.on('autoAdvanceDone', () => {
  document.getElementById('auto-advance-bar').classList.add('hidden');
});

document.getElementById('next-q-btn').addEventListener('click', () => {
  socket.emit('nextQuestion', currentPin);
});

socket.on('podium', ({ winners, allPlayers }) => {
  const medals = ['🥇','🥈','🥉'];
  const podiumPlaces = document.getElementById('podium-places');
  if (podiumPlaces) {
    podiumPlaces.innerHTML = winners.map((p, i) => `
      <div class="podium-place place-${i+1}">
        <div class="medal">${medals[i]}</div>
        <div class="podium-name">${p.name}</div>
        <div class="podium-score">${p.score} pts</div>
      </div>
    `).join('');
  }

  document.getElementById('full-leaderboard').innerHTML = allPlayers.map((p, i) => `
    <div class="lb-item">
      <span class="rank">#${i + 1}</span>
      <span class="name">${p.name}</span>
      <span class="score">${p.score} pts</span>
    </div>
  `).join('');

  // Confetti!
  const end = Date.now() + 3000;
  (function frame() {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());

  goToScreen('podium-screen');
});

document.getElementById('play-again-btn').addEventListener('click', () => {
  globalQuestionsArray = [];
  document.getElementById('questions-list').innerHTML = '';
  document.getElementById('quiz-title').value = '';
  updateCreateBtn();
  goToScreen('builder-screen');
});

socket.on('gameTerminated', (msg) => {
    alert(msg);
    window.location.reload();
});
