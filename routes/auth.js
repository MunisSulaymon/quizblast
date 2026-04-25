const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');

const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 10,
  message: { msg: 'Too many attempts, try again later' }
});

// REGISTER
router.post('/register', limiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate username
    if (!username || typeof username !== 'string') 
      return res.status(400).json({ msg: 'Username is required' });
    if (username.length < 3 || username.length > 20)
      return res.status(400).json({ msg: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ msg: 'Username: letters, numbers, underscores only' });

    // Validate email
    if (!email || typeof email !== 'string')
      return res.status(400).json({ msg: 'Email is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ msg: 'Please enter a valid email address' });

    // Validate password
    if (!password || typeof password !== 'string')
      return res.status(400).json({ msg: 'Password is required' });
    if (password.length < 6)
      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
    if (password.length > 50)
      return res.status(400).json({ msg: 'Password is too long' });

    // Check duplicates
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) 
      return res.status(400).json({ msg: 'This email is already registered' });

    const existingUsername = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });
    if (existingUsername)
      return res.status(400).json({ msg: 'This username is already taken' });

    const user = new User({ 
      username, 
      email: email.toLowerCase(), 
      password 
    });
    await user.save();

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
      user: { id: user._id, username, email }
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

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ 
      msg: 'Invalid credentials' 
    });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ 
      msg: 'Invalid credentials' 
    });

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
      user: { id: user._id, username: user.username, email } 
    });
  } catch (err) {
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
