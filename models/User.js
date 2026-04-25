const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, required: true, 
    unique: true, trim: true, minlength: 3 
  },
  email: { 
    type: String, required: true, 
    unique: true, lowercase: true 
  },
  password: { type: String, required: true },
  quizzes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Quiz' 
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model('User', userSchema);
