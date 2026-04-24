const socket = io();
let myName = '';
let myPin = '';
let myScore = 0;
let hasAnswered = false;
let questionStartTime = Date.now();

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

function submitAnswer(idx) {
    if (hasAnswered) return;
    hasAnswered = true;

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
    feedbackMain.innerText = "✅ Correct!";
    feedbackFull.className = "feedback-full correct-bg";
    reveal.classList.add('hidden');
  } else {
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
    const myFinal = allPlayers.find(p => p.name === myName);
    const myRank = allPlayers.findIndex(p => p.name === myName) + 1;
    
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
