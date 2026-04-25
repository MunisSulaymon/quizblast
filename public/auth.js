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
  const email = document.getElementById('email')
    .value.trim();
  const password = document.getElementById('password')
    .value;
  const errDiv = document.getElementById('error-msg');
  const verifyNotice = document.getElementById(
    'verification-notice'
  );

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
    } else if (res.status === 403 && 
               data.needsVerification) {
      // Show verification notice
      sessionStorage.setItem('verifyEmail', data.email);
      if (verifyNotice) {
        verifyNotice.classList.remove('hidden');
        errDiv.classList.add('hidden');
      } else {
        window.location.href = 'check-email.html';
      }
      btn.textContent = 'LOGIN';
      btn.disabled = false;
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
  const username = document.getElementById('username')
    .value.trim();
  const email = document.getElementById('email')
    .value.trim();
  const password = document.getElementById('password')
    .value;
  const confirm = document.getElementById(
    'confirm-password'
  ).value;
  const errDiv = document.getElementById('error-msg');

  if (!username || !email || !password || !confirm) {
    showError(errDiv, 'Please fill in all fields');
    return;
  }
  if (username.length < 3) {
    showError(errDiv, 'Username min 3 characters');
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError(errDiv, 
      'Username: letters, numbers, underscores only');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(errDiv, 'Please enter a valid email');
    return;
  }
  if (password.length < 6) {
    showError(errDiv, 'Password min 6 characters');
    return;
  }
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
      // Save email for check-email page
      sessionStorage.setItem('verifyEmail', email);
      window.location.href = 'check-email.html';
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

// RESEND VERIFICATION
async function handleResendVerification() {
  const email = sessionStorage.getItem('verifyEmail');
  const btn = document.getElementById('resend-btn');
  const timer = document.getElementById('cooldown-timer');
  const successDiv = document.getElementById('resend-success');
  const secondsSpan = document.getElementById('seconds');

  if (!email) {
    alert('Email not found. Please go back to login.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await fetch('/api/auth/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    btn.textContent = 'Email Sent!';
    if (successDiv) successDiv.classList.remove('hidden');
    if (timer) timer.classList.remove('hidden');

    let timeLeft = 60;
    const interval = setInterval(() => {
      timeLeft--;
      if (secondsSpan) secondsSpan.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = '📨 Resend Email';
        if (timer) timer.classList.add('hidden');
        if (successDiv) successDiv.classList.add('hidden');
      }
    }, 1000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '📨 Resend Email';
    alert('Failed to send. Please try again.');
  }
}

// RESEND FROM LOGIN PAGE
function resendFromLogin() {
  const email = sessionStorage.getItem('verifyEmail');
  if (email) {
    fetch('/api/auth/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    alert('Verification email sent! Check your inbox.');
  } else {
    window.location.href = 'verify-error.html';
  }
}

// FORGOT PASSWORD
async function handleForgotPassword() {
  const btn = document.getElementById('forgot-btn');
  const email = document.getElementById('email')
    .value.trim();
  const errDiv = document.getElementById('error-msg');
  const successDiv = document.getElementById('success-msg');

  if (!email) {
    showError(errDiv, 'Please enter your email');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(errDiv, 'Please enter a valid email');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    errDiv.classList.add('hidden');
    if (successDiv) {
      successDiv.textContent = data.msg;
      successDiv.classList.remove('hidden');
    }
  } catch (e) {
    showError(errDiv, 'Connection error. Try again.');
  }

  btn.disabled = false;
  btn.textContent = 'Send Reset Link';
}

// VALIDATE RESET TOKEN ON PAGE LOAD
async function validateResetToken() {
  const urlParams = new URLSearchParams(
    window.location.search
  );
  const token = urlParams.get('token');

  if (!token) {
    showResetState('error');
    return;
  }

  try {
    const res = await fetch(
      `/api/auth/reset-password/validate?token=${token}`
    );
    const data = await res.json();
    showResetState(data.valid ? 'form' : 'error');
  } catch (e) {
    showResetState('error');
  }
}

function showResetState(state) {
  const loading = document.getElementById('loading-state');
  const form = document.getElementById('reset-form-card');
  const error = document.getElementById('error-state');

  if (loading) loading.classList.add('hidden');
  if (form) form.classList.toggle('hidden', state !== 'form');
  if (error) error.classList.toggle('hidden', state !== 'error');
}

// EXECUTE PASSWORD RESET
async function handleResetPassword() {
  const btn = document.getElementById('reset-btn');
  const urlParams = new URLSearchParams(
    window.location.search
  );
  const token = urlParams.get('token');
  const newPassword = document.getElementById('password')
    .value;
  const confirm = document.getElementById('confirm-password')
    .value;
  const errDiv = document.getElementById('error-msg');

  if (!newPassword || !confirm) {
    showError(errDiv, 'Please fill in all fields');
    return;
  }
  if (newPassword.length < 6) {
    showError(errDiv, 'Password min 6 characters');
    return;
  }
  if (newPassword !== confirm) {
    showError(errDiv, 'Passwords do not match');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating password...';

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await res.json();

    if (res.ok) {
      alert('Password reset successfully!');
      window.location.href = 'login.html';
    } else {
      showError(errDiv, data.msg || 'Reset failed');
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  } catch (e) {
    showError(errDiv, 'Connection error. Try again.');
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
}
