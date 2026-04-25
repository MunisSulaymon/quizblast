let currentSession = null;
let scoreChartInstance = null;
let accuracyChartInstance = null;

// ---- AUTH CHECK ----
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = 'login.html';
      return null;
    }
    const user = await res.json();
    document.getElementById('nav-username').textContent = user.username;
    return user;
  } catch (e) {
    window.location.href = 'login.html';
    return null;
  }
}

// ---- LOGOUT ----
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// ---- TABS ----
function switchTab(tab) {
  document.getElementById('quizzes-tab')
    .classList.toggle('hidden', tab !== 'quizzes');
  document.getElementById('analytics-tab')
    .classList.toggle('hidden', tab !== 'analytics');
  document.getElementById('tab-quizzes')
    .classList.toggle('active', tab === 'quizzes');
  document.getElementById('tab-analytics')
    .classList.toggle('active', tab === 'analytics');
  if (tab === 'analytics') loadAnalytics();
}

// ---- LOAD QUIZZES ----
async function loadQuizzes() {
  const grid = document.getElementById('quiz-grid');
  try {
    const res = await fetch('/api/quizzes');
    if (!res.ok) throw new Error('Failed');
    const quizzes = await res.json();

    if (quizzes.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h3>No quizzes yet!</h3>
          <p>Create your first quiz to get started.</p>
          <button onclick="location.href='host.html'" 
            class="btn-create-new">
            ➕ Create New Quiz
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = quizzes.map(q => `
      <div class="quiz-card" id="card-${q._id}">
        <div class="quiz-card-header">
          <h3 class="quiz-title">${q.title}</h3>
          <span class="quiz-badge">${q.questionCount} Qs</span>
        </div>
        <div class="quiz-meta">
          <span>📅 ${new Date(q.createdAt).toLocaleDateString()}</span>
          <span>▶️ Played ${q.timesPlayed}x</span>
        </div>
        <div class="quiz-actions">
          <button onclick="playQuiz('${q._id}')" 
            class="btn-play">▶️ Play</button>
          <button onclick="editQuiz('${q._id}')" 
            class="btn-edit">✏️ Edit</button>
          <button onclick="showQuizAnalytics('${q._id}')"
            class="btn-stats">📊 Stats</button>
          <button onclick="deleteQuiz('${q._id}')" 
            class="btn-delete">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = '<div class="error-state">Failed to load quizzes</div>';
  }
}

// ---- PLAY QUIZ ----
async function playQuiz(id) {
  try {
    const res = await fetch(`/api/quizzes/${id}`);
    const quiz = await res.json();
    localStorage.setItem('loadedQuiz', JSON.stringify(quiz));
    window.location.href = 'host.html';
  } catch (e) {
    alert('Failed to load quiz');
  }
}

// ---- EDIT QUIZ ----
async function editQuiz(id) {
  try {
    const res = await fetch(`/api/quizzes/${id}`);
    const quiz = await res.json();
    localStorage.setItem('editQuiz', JSON.stringify(quiz));
    window.location.href = 'host.html';
  } catch (e) {
    alert('Failed to load quiz');
  }
}

// ---- DELETE QUIZ ----
async function deleteQuiz(id) {
  if (!confirm('Delete this quiz? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/quizzes/${id}`, { 
      method: 'DELETE' 
    });
    if (res.ok) {
      document.getElementById(`card-${id}`).remove();
      showToast('Quiz deleted ✓');
    }
  } catch (e) {
    alert('Failed to delete quiz');
  }
}

// ---- LOAD ANALYTICS ----
async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    const { sessions, stats } = await res.json();

    document.getElementById('stat-games').textContent = stats.totalGames;
    document.getElementById('stat-players').textContent = stats.totalPlayers;
    document.getElementById('stat-score').textContent = stats.avgScore;
    document.getElementById('stat-accuracy').textContent = stats.avgAccuracy + '%';

    const list = document.getElementById('sessions-list');
    if (sessions.length === 0) {
      list.innerHTML = '<div class="empty-state">No games played yet!</div>';
      return;
    }

    list.innerHTML = `
      <table class="sessions-table">
        <thead>
          <tr>
            <th>Quiz</th>
            <th>Date</th>
            <th>Players</th>
            <th>Avg Score</th>
            <th>Accuracy</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.map(s => `
            <tr>
              <td>${s.quizId?.title || 'Unknown'}</td>
              <td>${new Date(s.playedAt).toLocaleDateString()}</td>
              <td>${s.totalPlayers}</td>
              <td>${Math.round(s.avgScore)}</td>
              <td>${Math.round(s.accuracyRate)}%</td>
              <td>
                <button onclick="showDetail('${s._id}')" 
                  class="btn-detail">
                  🔍 Details
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    document.getElementById('sessions-list').innerHTML = 
      '<div class="error-state">Failed to load analytics</div>';
  }
}

// ---- SHOW SESSION DETAIL ----
async function showDetail(id) {
  try {
    const res = await fetch(`/api/analytics/${id}`);
    const data = await res.json();
    currentSession = data;

    document.getElementById('modal-title').textContent = 
      `📊 ${data.quizId?.title || 'Game'} Results`;
    
    document.getElementById('detail-modal')
      .classList.remove('hidden');

    renderScoreChart(data.players);
    renderAccuracyChart(data.accuracyRate);
    renderQuestionTable(data.questionStats);
    renderPlayersTable(data.players);
  } catch (e) {
    alert('Failed to load session details');
  }
}

function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  if (scoreChartInstance) scoreChartInstance.destroy();
  if (accuracyChartInstance) accuracyChartInstance.destroy();
}

// ---- CHARTS ----
function renderScoreChart(players) {
  if (scoreChartInstance) scoreChartInstance.destroy();
  const ctx = document.getElementById('score-chart').getContext('2d');
  const sorted = [...players].sort((a,b) => b.score - a.score);
  scoreChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(p => p.name),
      datasets: [{
        label: 'Score',
        data: sorted.map(p => p.score),
        backgroundColor: '#46178F',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderAccuracyChart(accuracyRate) {
  if (accuracyChartInstance) accuracyChartInstance.destroy();
  const ctx = document.getElementById('accuracy-chart').getContext('2d');
  const correct = Math.round(accuracyRate || 0);
  const incorrect = 100 - correct;
  accuracyChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Correct', 'Incorrect'],
      datasets: [{
        data: [correct, incorrect],
        backgroundColor: ['#26890C', '#FF3355'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function renderQuestionTable(questionStats) {
  const tbody = document.getElementById('q-stats-body');
  if (!tbody || !questionStats) return;
  tbody.innerHTML = questionStats.map(q => `
    <tr class="diff-${getDiffClass(q.difficulty)}">
      <td>Q${q.questionIndex + 1}</td>
      <td>${q.correctPct || 0}%</td>
      <td>${q.avgTime || 0}s</td>
      <td>${q.difficulty || 'N/A'}</td>
    </tr>
  `).join('');
}

function getDiffClass(diff) {
  if (!diff) return 'medium';
  if (diff.includes('Easy')) return 'easy';
  if (diff.includes('Hard')) return 'hard';
  return 'medium';
}

function renderPlayersTable(players) {
  const tbody = document.getElementById('players-body');
  if (!tbody) return;
  const sorted = [...players].sort((a,b) => b.score - a.score);
  tbody.innerHTML = sorted.map((p, i) => `
    <tr>
      <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i+1)}</td>
      <td>${p.name}</td>
      <td>${p.score}</td>
      <td>${Math.round(p.accuracy || 0)}%</td>
    </tr>
  `).join('');
}

// ---- EXPORT CSV ----
function exportCSV() {
  if (!currentSession) return;
  const rows = [
    ['Player', 'Score', 'Accuracy'],
    ...currentSession.players
      .sort((a,b) => b.score - a.score)
      .map(p => [p.name, p.score, Math.round(p.accuracy || 0) + '%'])
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quizblast-results-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- SHOW QUIZ ANALYTICS ----
async function showQuizAnalytics(quizId) {
  switchTab('analytics');
  await loadAnalytics();
}

// ---- TOAST NOTIFICATION ----
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---- PAGE LOAD ----
window.onload = async () => {
  await checkAuth();
  loadQuizzes();
};
