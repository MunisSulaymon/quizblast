// Check if already logged in
async function checkAlreadyLoggedIn() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) window.location.href = 'dashboard.html';
  } catch (e) {}
}

// LOGIN
async function handleLogin() {
  const btn = document.getElementById('login-btn');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errDiv = document.getElementById('error-msg');

  if (!email || !password) {
    showError(errDiv, 'Please fill in all fields');
    return;
  }

  btn.textContent = 'Logging in...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = 'dashboard.html';
    } else {
      showError(errDiv, data.msg || 'Login failed');
      btn.textContent = 'LOGIN';
      btn.disabled = false;
    }
  } catch (e) {
    showError(errDiv, 'Connection error. Try again.');
    btn.textContent = 'LOGIN';
    btn.disabled = false;
  }
}

// REGISTER
async function handleRegister() {
  const btn = document.getElementById('register-btn');
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm-password').value;
  const errDiv = document.getElementById('error-msg');

  // USERNAME validation
  if (!username) {
    showError(errDiv, 'Username is required');
    return;
  }
  if (username.length < 3 || username.length > 20) {
    showError(errDiv, 'Username must be 3-20 characters');
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError(errDiv, 'Username can only contain letters, numbers and underscores');
    return;
  }

  // EMAIL validation
  if (!email) {
    showError(errDiv, 'Email is required');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(errDiv, 'Please enter a valid email address');
    return;
  }

  // PASSWORD validation
  if (!password) {
    showError(errDiv, 'Password is required');
    return;
  }
  if (password.length < 6) {
    showError(errDiv, 'Password must be at least 6 characters');
    return;
  }
  if (password.length > 50) {
    showError(errDiv, 'Password is too long');
    return;
  }

  // CONFIRM PASSWORD
  if (password !== confirm) {
    showError(errDiv, 'Passwords do not match');
    return;
  }

  btn.textContent = 'Creating account...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = 'dashboard.html';
    } else {
      showError(errDiv, data.msg || 'Registration failed');
      btn.textContent = 'CREATE ACCOUNT';
      btn.disabled = false;
    }
  } catch (e) {
    showError(errDiv, 'Connection error. Try again.');
    btn.textContent = 'CREATE ACCOUNT';
    btn.disabled = false;
  }
}

// PASSWORD STRENGTH
function checkStrength(val) {
  const fill = document.getElementById('strength-fill');
  const text = document.getElementById('strength-text');
  if (!fill) return;
  
  if (val.length === 0) {
    fill.style.width = '0%';
    text.textContent = '';
  } else if (val.length < 6) {
    fill.style.width = '33%';
    fill.style.background = '#FF3355';
    text.textContent = 'Weak';
    text.style.color = '#FF3355';
  } else if (val.length < 10) {
    fill.style.width = '66%';
    fill.style.background = '#D89E00';
    text.textContent = 'Medium';
    text.style.color = '#D89E00';
  } else {
    fill.style.width = '100%';
    fill.style.background = '#26890C';
    text.textContent = 'Strong 💪';
    text.style.color = '#26890C';
  }
}

// TOGGLE PASSWORD VISIBILITY
function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// GUEST MODE
function guestMode() {
  localStorage.setItem('guestMode', 'true');
  localStorage.removeItem('currentUser');
  window.location.href = 'host.html';
}

// HELPER
function showError(div, msg) {
  if (!div) return;
  div.textContent = msg;
  div.classList.remove('hidden');
  setTimeout(() => div.classList.add('hidden'), 4000);
}

// Auto-check on page load
window.onload = checkAlreadyLoggedIn;

// Enter key support
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('login-btn')) handleLogin();
    if (document.getElementById('register-btn')) handleRegister();
  }
});
