const socket = io();
let currentPin = null;
let quizData = { title: '', questions: [] };

// DOM Elements
const screens = ['builder-screen', 'lobby-screen', 'question-screen', 'results-screen', 'podium-screen'];

function goToScreen(targetId) {
    screens.forEach(id => {
        document.getElementById(id).classList.toggle('active', id === targetId);
    });
}

// Builder Logic
const addQBtn = document.getElementById('add-q-btn');
const createGameBtn = document.getElementById('create-game-btn');
const questionsList = document.getElementById('questions-list');

addQBtn.addEventListener('click', () => {
    const qText = document.getElementById('q-text').value;
    const ans0 = document.getElementById('ans-0').value;
    const ans1 = document.getElementById('ans-1').value;
    const ans2 = document.getElementById('ans-2').value;
    const ans3 = document.getElementById('ans-3').value;
    const correctIdx = parseInt(document.querySelector('input[name="correct"]:checked').value);
    const timeLimit = parseInt(document.getElementById('q-time').value);

    if (!qText || !ans0 || !ans1 || !ans2 || !ans3) {
        alert('Please fill in all fields for the question!');
        return;
    }

    quizData.questions.push({
        question: qText,
        answers: [ans0, ans1, ans2, ans3],
        correctIndex: correctIdx,
        timeLimit: timeLimit
    });

    // Clear form
    document.getElementById('q-text').value = '';
    document.getElementById('ans-0').value = '';
    document.getElementById('ans-1').value = '';
    document.getElementById('ans-2').value = '';
    document.getElementById('ans-3').value = '';

    renderQuestionsPreview();
    updateCreateBtn();
});

function renderQuestionsPreview() {
    questionsList.innerHTML = quizData.questions.map((q, i) => `
        <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem; border-left: 5px solid var(--primary-purple);">
            <strong>Q${i+1}:</strong> ${q.question}
        </div>
    `).join('');
}

function updateCreateBtn() {
    const title = document.getElementById('quiz-title').value;
    createGameBtn.disabled = !(title && quizData.questions.length > 0);
}

document.getElementById('quiz-title').addEventListener('input', updateCreateBtn);

createGameBtn.addEventListener('click', () => {
    quizData.title = document.getElementById('quiz-title').value;
    socket.emit('createGame', quizData);
});

// Socket Listeners
socket.on('gameCreated', ({ pin }) => {
    currentPin = pin;
    document.getElementById('pin-display').innerText = pin;
    
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
        <div class="player-tag">${name}</div>
    `).join('');
    
    document.getElementById('start-game-btn').disabled = count === 0;
});

document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('startGame', currentPin);
});

socket.on('nextQuestion', ({ questionIndex, totalQuestions, question, answers, timeLimit }) => {
    document.getElementById('q-progress').innerText = `Question ${questionIndex + 1} of ${totalQuestions}`;
    document.getElementById('host-question-text').innerText = question;
    document.getElementById('ans-text-0').innerText = answers[0];
    document.getElementById('ans-text-1').innerText = answers[1];
    document.getElementById('ans-text-2').innerText = answers[2];
    document.getElementById('ans-text-3').innerText = answers[3];
    document.getElementById('p-answered').innerText = `0 / ${document.getElementById('lobby-player-list').children.length} Answered`;
    
    // Reset Timer Bar
    const timerBar = document.getElementById('timer-bar');
    timerBar.style.width = '100%';
    timerBar.style.transition = 'none';
    setTimeout(() => {
        timerBar.style.transition = `width ${timeLimit}s linear`;
        timerBar.style.width = '0%';
    }, 50);

    goToScreen('question-screen');
});

socket.on('timerTick', (timeLeft) => {
    document.getElementById('host-timer-num').innerText = timeLeft;
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
        document.getElementById(`bar-${i}`).style.height = `${height}%`;
    });

    // Update Leaderboard
    document.getElementById('results-leaderboard').innerHTML = leaderboard.map(p => `
        <div class="lb-item">
            <span>#${p.rank} ${p.name}</span>
            <span>${p.score} pts</span>
        </div>
    `).join('');

    // Update next button text
    const isLast = quizData.questions.length === (parseInt(document.getElementById('q-progress').innerText.split(' ')[1]));
    document.getElementById('next-q-btn').innerText = isLast ? '🏆 See Final Results' : '⏭️ Next Question';

    goToScreen('results-screen');
});

document.getElementById('next-q-btn').addEventListener('click', () => {
    socket.emit('nextQuestion', currentPin);
});

socket.on('podium', ({ winners, allPlayers }) => {
    document.getElementById('podium-1').innerText = winners[0] ? winners[0].name : '---';
    document.getElementById('podium-2').innerText = winners[1] ? winners[1].name : '---';
    document.getElementById('podium-3').innerText = winners[2] ? winners[2].name : '---';

    document.getElementById('full-leaderboard').innerHTML = allPlayers.map((p, i) => `
        <div class="lb-item">
            <span>#${i+1} ${p.name}</span>
            <span>${p.score} pts</span>
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
    quizData = { title: '', questions: [] };
    questionsList.innerHTML = '';
    document.getElementById('quiz-title').value = '';
    updateCreateBtn();
    goToScreen('builder-screen');
});
