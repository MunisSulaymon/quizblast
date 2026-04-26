const socket = io();
let myName = '';
let myPin = '';
let myScore = 0;
let hasAnswered = false;
let questionStartTime = Date.now();
let playerPowerups = [];
let isFrozen = false;

// Initialize mute button
function initPlayerMute() {
  const btn = document.getElementById('player-mute-btn');
  if (btn) {
    btn.textContent = soundManager.isMuted ? '🔇' : '🔊';
  }
}

function togglePlayerMute() {
  soundManager.unlock();
  const isMuted = soundManager.toggleMute();
  const btn = document.getElementById('player-mute-btn');
  if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
}

window.addEventListener('load', initPlayerMute);

// DOM Elements
const screens = ['join-screen', 'waiting-screen', 'question-screen', 'feedback-screen', 'leaderboard-screen', 'podium-screen'];

function goToScreen(targetId) {
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === targetId);
    });
}

// Check for PIN in URL
const urlParams = new URLSearchParams(window.location.search);
const pinFromUrl = urlParams.get('pin');
if (pinFromUrl) {
    document.getElementById('join-pin').value = pinFromUrl;
}

/* ---- NICKNAME VALIDATION ---- */
document.getElementById('join-name').addEventListener('input', (e) => {
  const val = e.target.value;
  const valid = /^[a-zA-Z0-9_]{2,15}$/.test(val);
  e.target.classList.toggle('valid', valid);
  e.target.classList.toggle('invalid', !valid && val.length > 0);
  document.querySelector('.input-hint').textContent =
    valid ? '✅ Looks good!' : 
    'Letters, numbers, underscores only (2-15 chars)';
});

// Join Logic
document.getElementById('join-btn').addEventListener('click', () => {
    const pin = document.getElementById('join-pin').value;
    const name = document.getElementById('join-name').value;
    const errorEl = document.getElementById('error-msg');

    if (!pin || !name) {
        errorEl.innerText = "Please enter a PIN and nickname.";
        errorEl.classList.remove('hidden');
        return;
    }

    if (!/^[a-zA-Z0-9_]{2,15}$/.test(name)) {
        return; // Don't submit if invalid
    }

    socket.emit('joinGame', { pin, name });
});

socket.on('joinedGame', ({ name, pin }) => {
    myName = name;
    myPin = pin;
    localStorage.setItem('playerName', name);
    document.getElementById('display-name').innerText = name;
    goToScreen('waiting-screen');
});

socket.on('errorMsg', (msg) => {
    const errorEl = document.getElementById('error-msg');
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
});

/* ---- SHOW QUESTION ON DEVICE ---- */
socket.on('nextQuestion', (data) => {
  soundManager.unlock();
  soundManager.playStart();
  const qDisplay = document.getElementById('player-question-display');
  const qText = document.getElementById('player-q-text');

  if (data.question) {
    qText.textContent = data.question;
    qDisplay.classList.remove('hidden');
  } else {
    qDisplay.classList.add('hidden');
  }

  document.getElementById('player-q-num').innerText = `Q ${data.questionIndex + 1} of ${data.totalQuestions}`;
  document.getElementById('lock-msg').classList.add('hidden');
  document.getElementById('player-timer-num').innerText = data.timeLimit;

  /* ---- QUESTION TYPE RENDERING ---- */
  if (data.type === 'true-false') {
    renderTrueFalse();
  } else {
    renderQuizGrid(data.answers);
  }

  /* ---- DOUBLE POINTS ANNOUNCEMENT ---- */
  if (data.pointsType === 'double') {
    const div = document.createElement('div');
    div.className = 'announcement-overlay';
    div.innerHTML = '<h1>🔥 DOUBLE POINTS! 🔥</h1>';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }

  // Reset Timer Bar
  hasAnswered = false;
  questionStartTime = Date.now();
  isFrozen = false;
  playerPowerups = [];

  const typeInput = document.getElementById('type-answer-input');
  const answersContainer = document.getElementById('answers-container');
  const textInput = document.getElementById('player-text-input');
  const hintDisplay = document.getElementById('hint-display');
  const powerupBar = document.getElementById('powerup-bar');

  // Reset type answer UI
  if (textInput) {
    textInput.value = '';
    textInput.disabled = false;
  }
  if (hintDisplay) hintDisplay.classList.add('hidden');

  // Show correct input type
  if (data.type === 'type-answer') {
    if (typeInput) typeInput.classList.remove('hidden');
    if (answersContainer) answersContainer.classList.add('hidden');
  } else {
    if (typeInput) typeInput.classList.add('hidden');
    if (answersContainer) answersContainer.classList.remove('hidden');
  }

  // Hide powerup bar if no powerups
  updatePowerupBar();

  const timerBar = document.getElementById('player-timer-bar');
  timerBar.style.width = '100%';
  timerBar.style.transition = 'none';
  setTimeout(() => {
    timerBar.style.transition = `width ${data.timeLimit}s linear`;
    timerBar.style.width = '0%';
  }, 50);

  goToScreen('question-screen');
});

function renderTrueFalse() {
  const container = document.getElementById('answers-container');
  container.innerHTML = `
    <div class="tf-grid">
      <button class="btn-tf true-btn" onclick="submitAnswer(0)">
        ✅ TRUE
      </button>
      <button class="btn-tf false-btn" onclick="submitAnswer(1)">
        ❌ FALSE
      </button>
    </div>
  `;
}

function renderQuizGrid(answers) {
  const colors = ['red','blue','yellow','green'];
  const icons  = ['🔴','🔵','🟡','🟢'];
  const container = document.getElementById('answers-container');
  container.innerHTML = `
    <div class="answers-grid">
      ${answers.map((a,i) => `
        <button class="btn-answer ${colors[i]}" 
          onclick="submitAnswer(${i})" style="width:100%; text-align:left; font-size:1.2rem; padding:1.5rem; color:white; border-radius:16px;">
          ${icons[i]} ${a}
        </button>
      `).join('')}
    </div>
  `;
}

const textInput = document.getElementById('player-text-input');
const charCount = document.getElementById('char-count');
const submitTextBtn = document.getElementById('submit-text-btn');

if (textInput) {
  textInput.addEventListener('input', () => {
    if (charCount) charCount.textContent = textInput.value.length;
  });
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !hasAnswered) {
      submitTypeAnswer();
    }
  });
}

if (submitTextBtn) {
  submitTextBtn.addEventListener('click', submitTypeAnswer);
}

function submitTypeAnswer() {
  if (hasAnswered || isFrozen) return;
  const text = document.getElementById('player-text-input')
    ?.value.trim();
  if (!text) return;

  hasAnswered = true;
  soundManager.playAnswerLock();

  const input = document.getElementById('player-text-input');
  const btn = document.getElementById('submit-text-btn');
  if (input) input.disabled = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✓ Submitted!';
  }

  const timeTaken = (Date.now() - questionStartTime) / 1000;
  socket.emit('submitAnswer', {
    pin: myPin,
    answerText: text,
    timeTaken
  });
}

function submitAnswer(idx) {
    if (hasAnswered || isFrozen) return;
    hasAnswered = true;
    soundManager.playAnswerLock();

    socket.emit('submitAnswer', { 
        pin: myPin, 
        answerIndex: idx,
        timeTaken: (Date.now() - questionStartTime) / 1000
    });
    
    // Disable buttons
    const buttons = document.querySelectorAll('.btn-answer, .btn-tf');
    buttons.forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.5';
    });
    document.getElementById('lock-msg').classList.remove('hidden');
}

socket.on('timerTick', (timeLeft) => {
    if (timeLeft <= 5 && timeLeft > 0) {
      soundManager.playUrgentTick();
    }
    document.getElementById('player-timer-num').innerText = timeLeft;
    if (timeLeft === 0) {
        document.querySelectorAll('.btn-answer, .btn-tf').forEach(btn => btn.disabled = true);
    }
});

/* ---- STREAK DISPLAY ---- */
socket.on('answerResult', (data) => {
  const feedbackMain = document.getElementById('feedback-main');
  const feedbackFull = document.getElementById('feedback-full');
  const reveal = document.getElementById('correct-ans-reveal');

  if (data.correct) {
    soundManager.playCorrect();
    if (data.streak >= 3) {
      setTimeout(() => soundManager.playStreak(), 600);
    }
    feedbackMain.innerText = "✅ Correct!";
    if (data.matchType === 'fuzzy') {
      feedbackMain.innerText = '✅ Close enough! (fuzzy match)';
    }
    feedbackFull.className = "feedback-full correct-bg";
    reveal.classList.add('hidden');
  } else {
    soundManager.playWrong();
    feedbackMain.innerText = "❌ Wrong!";
    feedbackFull.className = "feedback-full wrong-bg";
    reveal.innerText = `The correct answer was: ${data.correctAnswer}`;
    reveal.classList.remove('hidden');
  }

  document.getElementById('feedback-points').innerText = `+${data.points} points`;
  
  const streakEl = document.getElementById('streak-display');
  if (data.streak >= 3) {
    streakEl.innerHTML = `<span class="streak-badge">🔥 ${data.streak} Streak!</span>`;
    streakEl.classList.remove('hidden');
    document.getElementById('streak-msg').innerText = `🔥 ${data.streak} streak!`;
  } else {
    streakEl.classList.add('hidden');
    document.getElementById('streak-msg').innerText = "";
  }

  document.getElementById('total-score-val').innerText = data.totalScore;
  document.getElementById('rank-val').innerText = `#${data.rank}`;
  document.getElementById('total-players-val').innerText = data.totalPlayers;
  
  myScore = data.totalScore;
  
  goToScreen('feedback-screen');
});

socket.on('roundResults', ({ leaderboard }) => {
    soundManager.playResults();
    document.getElementById('player-leaderboard-list').innerHTML = leaderboard.map(p => `
        <div class="lb-item ${p.name === myName ? 'highlight' : ''}">
            <span>#${p.rank} ${p.name}</span>
            <span>${p.score} pts</span>
        </div>
    `).join('');

    goToScreen('leaderboard-screen');
});

/* ---- AUTO-PLAY COUNTDOWN (player side) ---- */
socket.on('autoAdvanceCountdown', (seconds) => {
  const bar = document.getElementById('auto-advance-bar');
  bar.textContent = `Next question in ${seconds}...`;
  bar.classList.remove('hidden');
});

socket.on('autoAdvanceDone', () => {
  document.getElementById('auto-advance-bar').classList.add('hidden');
});

socket.on('podium', ({ winners, allPlayers }) => {
    const myNameSaved = localStorage.getItem('playerName') || '';
    const myFinal = allPlayers.find(p => p.name === myNameSaved);
    const myRank = allPlayers.findIndex(p => p.name === myNameSaved) + 1;
    
    if (myRank === 1) {
      soundManager.playWinner();
    } else if (myRank <= 3) {
      soundManager.playStreak();
    } else {
      soundManager.playStart();
    }

    document.getElementById('final-rank-msg').innerText = `Your Rank: #${myRank}`;
    document.getElementById('final-score-val').innerText = myFinal ? myFinal.score : myScore;
    
    const medalEl = document.getElementById('final-medal');
    if (myRank === 1) {
        medalEl.innerText = "🥇";
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } else if (myRank === 2) {
        medalEl.innerText = "🥈";
        confetti({ particleCount: 100, spread: 50, origin: { y: 0.6 } });
    } else if (myRank === 3) {
        medalEl.innerText = "🥉";
        confetti({ particleCount: 80, spread: 40, origin: { y: 0.6 } });
    } else {
        medalEl.innerText = "🎮";
    }

    goToScreen('podium-screen');
});

socket.on('gameTerminated', (msg) => {
    alert(msg);
    window.location.href = 'index.html';
});

socket.on('roomLockStatus', (locked) => {
    if (locked) {
        console.log("Room is now locked.");
    } else {
        console.log("Room is now unlocked.");
    }
});

socket.on('powerUpEarned', ({ powerup, message }) => {
  playerPowerups.push(powerup);
  showPowerupToast(`🎁 Earned: ${message}`);
  updatePowerupBar();
});

socket.on('powerUpEffect', (data) => {
  switch(data.type) {
    case 'frozen':
      activateFreeze(data.duration || 3000);
      break;
    case 'doublePoints':
    case 'streakProtect':
    case 'shield':
    case 'freezeSent':
    case 'freezeFailed':
      showPowerupToast(data.message);
      break;
    case 'fiftyfifty':
      applyFiftyFifty(data.removeIndexes);
      break;
    case 'hint':
      showHint(data.hint);
      break;
  }
});

function updatePowerupBar() {
  const bar = document.getElementById('powerup-bar');
  const slots = document.getElementById('powerup-slots');
  if (!bar || !slots) return;

  if (playerPowerups.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  const icons = {
    doublePoints: '📈',
    shield: '🛡️',
    streakProtect: '🔥',
    hint: '💡',
    freeze: '❄️',
    fiftyfifty: '✂️'
  };

  slots.innerHTML = playerPowerups.map((p, i) => `
    <button class="powerup-slot" 
      onclick="activatePowerup('${p}', ${i})"
      title="${getPowerUpDisplayName(p)}">
      ${icons[p] || '⚡'}
    </button>
  `).join('');
}

function getPowerUpDisplayName(type) {
  const names = {
    doublePoints: '2X Points',
    shield: 'Shield',
    streakProtect: 'Streak Guard',
    hint: 'Hint',
    freeze: 'Freeze',
    fiftyfifty: '50/50'
  };
  return names[type] || type;
}

function activatePowerup(type, index) {
  if (hasAnswered && type !== 'freeze') return;
  socket.emit('usePowerUp', { 
    pin: myPin, 
    powerupType: type 
  });
  playerPowerups.splice(index, 1);
  updatePowerupBar();
}

function activateFreeze(duration) {
  isFrozen = true;
  soundManager.playWrong();
  const overlay = document.getElementById('freeze-overlay');
  if (overlay) overlay.classList.remove('hidden');

  let count = Math.ceil(duration / 1000);
  const countEl = document.getElementById('freeze-countdown');
  if (countEl) countEl.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (countEl) countEl.textContent = count;
    if (count <= 0) {
      clearInterval(interval);
      isFrozen = false;
      if (overlay) overlay.classList.add('hidden');
    }
  }, 1000);
}

function applyFiftyFifty(removeIndexes) {
  removeIndexes.forEach(idx => {
    const btns = document.querySelectorAll('.btn-answer');
    if (btns[idx]) {
      btns[idx].style.opacity = '0.2';
      btns[idx].disabled = true;
    }
  });
  showPowerupToast('50/50 applied! ✂️');
}

function showHint(letter) {
  const hintDisplay = document.getElementById('hint-display');
  if (hintDisplay) {
    hintDisplay.textContent = `💡 Hint: Starts with "${letter}"`;
    hintDisplay.classList.remove('hidden');
  }
}

function showPowerupToast(message) {
  const toast = document.getElementById('powerup-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
