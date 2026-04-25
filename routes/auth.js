const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const Token = require('../models/Token');
const { 
  sendVerificationEmail, 
  sendPasswordResetEmail 
} = require('../services/emailService');

const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 10,
  message: { msg: 'Too many attempts, try again later' }
});

// REGISTER
router.post('/register', limiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || typeof username !== 'string')
      return res.status(400).json({ msg: 'Username is required' });
    if (username.length < 3 || username.length > 20)
      return res.status(400).json({ msg: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ msg: 'Username: letters, numbers, underscores only' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ msg: 'Valid email required' });
    if (!password || password.length < 6)
      return res.status(400).json({ msg: 'Password min 6 characters' });

    const existingEmail = await User.findOne({ 
      email: email.toLowerCase() 
    });
    if (existingEmail)
      return res.status(400).json({ msg: 'Email already registered' });

    const existingUsername = await User.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    });
    if (existingUsername)
      return res.status(400).json({ msg: 'Username already taken' });

    const user = new User({ 
      username, 
      email: email.toLowerCase(), 
      password,
      isVerified: false
    });
    await user.save();

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await new Token({ 
      userId: user._id, 
      token: verifyToken, 
      type: 'verify' 
    }).save();

    // Send verification email
    await sendVerificationEmail(user.email, verifyToken, user.username);

    // Store email in response for frontend
    res.json({ 
      success: true, 
      msg: 'Account created! Please check your email to verify.',
      email: user.email
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// LOGIN
router.post('/login', limiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ msg: 'All fields required' });

    const user = await User.findOne({ 
      email: email.toLowerCase() 
    });
    if (!user)
      return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ msg: 'Invalid credentials' });

    // Check if verified
    if (!user.isVerified) {
      return res.status(403).json({
        msg: 'Please verify your email before logging in.',
        needsVerification: true,
        email: user.email
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }).json({
      success: true,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// VERIFY EMAIL
router.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.redirect('/verify-error.html');

    const tokenDoc = await Token.findOne({ 
      token, 
      type: 'verify' 
    });
    if (!tokenDoc) return res.redirect('/verify-error.html');

    const user = await User.findById(tokenDoc.userId);
    if (!user) return res.redirect('/verify-error.html');

    user.isVerified = true;
    await user.save();
    await Token.deleteOne({ _id: tokenDoc._id });

    // Auto login after verification
    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.redirect('/verified.html');
  } catch (err) {
    console.error(err);
    res.redirect('/verify-error.html');
  }
});

// RESEND VERIFICATION
router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ 
      email: email?.toLowerCase() 
    });

    if (user && !user.isVerified) {
      await Token.deleteMany({ 
        userId: user._id, 
        type: 'verify' 
      });
      const newToken = crypto.randomBytes(32).toString('hex');
      await new Token({ 
        userId: user._id, 
        token: newToken, 
        type: 'verify' 
      }).save();
      await sendVerificationEmail(user.email, newToken, user.username);
    }

    res.json({ 
      msg: 'If the account exists and is unverified, a new link was sent.' 
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// FORGOT PASSWORD
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ msg: 'Email required' });

    const user = await User.findOne({ 
      email: email.toLowerCase() 
    });

    if (user) {
      await Token.deleteMany({ 
        userId: user._id, 
        type: 'reset' 
      });
      const resetToken = crypto.randomBytes(32).toString('hex');
      await new Token({ 
        userId: user._id, 
        token: resetToken, 
        type: 'reset' 
      }).save();
      await sendPasswordResetEmail(user.email, resetToken, user.username);
    }

    res.json({ 
      msg: 'If your email exists, a reset link has been sent.' 
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// VALIDATE RESET TOKEN
router.get('/reset-password/validate', async (req, res) => {
  try {
    const { token } = req.query;
    const tokenDoc = await Token.findOne({ 
      token, 
      type: 'reset' 
    });
    res.json({ valid: !!tokenDoc });
  } catch (err) {
    res.json({ valid: false });
  }
});

// EXECUTE RESET PASSWORD
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword)
      return res.status(400).json({ msg: 'All fields required' });
    if (newPassword.length < 6)
      return res.status(400).json({ msg: 'Password min 6 characters' });

    const tokenDoc = await Token.findOne({ 
      token, 
      type: 'reset' 
    });
    if (!tokenDoc)
      return res.status(400).json({ msg: 'Invalid or expired token' });

    const user = await User.findById(tokenDoc.userId);
    if (!user)
      return res.status(400).json({ msg: 'User not found' });

    user.password = newPassword;
    await user.save();
    await Token.deleteOne({ _id: tokenDoc._id });

    res.json({ 
      success: true, 
      msg: 'Password reset successfully!' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ success: true });
});

// GET ME
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
