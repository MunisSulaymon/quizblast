const socket = io();
let myName = '';
let myPin = '';
let myScore = 0;

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

// Game Logic
socket.on('nextQuestion', ({ questionIndex, totalQuestions, timeLimit }) => {
    document.getElementById('player-q-num').innerText = `Q ${questionIndex + 1} of ${totalQuestions}`;
    document.getElementById('lock-msg').classList.add('hidden');
    
    // Enable buttons
    const buttons = document.querySelectorAll('.btn-answer');
    buttons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });

    // Reset Timer Bar
    const timerBar = document.getElementById('player-timer-bar');
    timerBar.style.width = '100%';
    timerBar.style.transition = 'none';
    setTimeout(() => {
        timerBar.style.transition = `width ${timeLimit}s linear`;
        timerBar.style.width = '0%';
    }, 50);

    goToScreen('question-screen');
});

socket.on('timerTick', (timeLeft) => {
    document.getElementById('player-timer-num').innerText = timeLeft;
    if (timeLeft === 0) {
        document.querySelectorAll('.btn-answer').forEach(btn => btn.disabled = true);
    }
});

document.querySelectorAll('.btn-answer').forEach(btn => {
    btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        socket.emit('submitAnswer', { pin: myPin, answerIndex: idx });
        
        // Disable all buttons
        document.querySelectorAll('.btn-answer').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
        });
        document.getElementById('lock-msg').classList.remove('hidden');
    });
});

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
    document.getElementById('streak-msg').innerText = data.streak >= 3 ? `🔥 ${data.streak} streak!` : "";
    document.getElementById('total-score-val').innerText = data.totalScore;
    document.getElementById('rank-val').innerText = `#${data.rank}`;
    document.getElementById('total-players-val').innerText = data.totalPlayers;
    
    myScore = data.totalScore;
    myRank = data.rank;
    totalPlayers = data.totalPlayers;

    // Show feedback immediately
    goToScreen('feedback-screen');
});

socket.on('roundResults', ({ leaderboard }) => {
    // Show leaderboard between rounds
    document.getElementById('player-leaderboard-list').innerHTML = leaderboard.map(p => `
        <div class="lb-item ${p.name === myName ? 'highlight' : ''}">
            <span>#${p.rank} ${p.name}</span>
            <span>${p.score} pts</span>
        </div>
    `).join('');

    goToScreen('leaderboard-screen');
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
