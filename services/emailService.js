const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const sendVerificationEmail = async (email, token, username) => {
  try {
    console.log('📧 Attempting to send email to:', email);
    console.log('🔑 RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
    console.log('🌍 APP_URL:', process.env.APP_URL);

    const verifyLink = `${APP_URL}/api/auth/verify?token=${token}`;
    console.log('🔗 Verify link:', verifyLink);

    const result = await resend.emails.send({
      from: 'QuizBlast <onboarding@resend.dev>',
      to: email,
      subject: '🎮 Verify your QuizBlast account',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#1a0b2e;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:40px auto;background:#2C0A6B;border-radius:24px;padding:40px;text-align:center;border:1px solid rgba(255,255,255,0.1);">
            <h1 style="color:#FFD700;font-size:2rem;margin-bottom:10px;">QuizBlast 🎮</h1>
            <h2 style="color:white;font-size:1.5rem;">Welcome, ${username}!</h2>
            <p style="color:rgba(255,255,255,0.7);font-size:1rem;line-height:1.6;margin:20px 0;">
              You're one step away from hosting the ultimate quiz sessions. 
              Click below to verify your email address.
            </p>
            <a href="${verifyLink}" 
              style="display:inline-block;background:#46178F;color:white;padding:16px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:1.1rem;border:2px solid white;margin:20px 0;">
              🚀 Verify My Account
            </a>
            <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-top:30px;">
              Link expires in 1 hour. If you didn't create this account, ignore this email.
            </p>
          </div>
        </body>
        </html>
      `
    });

    console.log('✅ Email sent result:', JSON.stringify(result));
    return { success: true };
  } catch (err) {
    console.error('❌ Email send error:', err);
    return { success: false, error: err };
  }
};

const sendPasswordResetEmail = async (email, token, username) => {
  try {
    const resetLink = `${APP_URL}/reset-password.html?token=${token}`;
    await resend.emails.send({
      from: 'QuizBlast <onboarding@resend.dev>',
      to: email,
      subject: '🔐 Reset your QuizBlast password',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#1a0b2e;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:40px auto;background:#2C0A6B;border-radius:24px;padding:40px;text-align:center;border:1px solid rgba(255,255,255,0.1);">
            <h1 style="color:#FFD700;font-size:2rem;margin-bottom:10px;">QuizBlast 🎮</h1>
            <h2 style="color:white;font-size:1.5rem;">Reset Your Password</h2>
            <p style="color:rgba(255,255,255,0.7);font-size:1rem;line-height:1.6;margin:20px 0;">
              We received a request to reset your password. 
              Click below to create a new one.
            </p>
            <a href="${resetLink}"
              style="display:inline-block;background:#FF3355;color:white;padding:16px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:1.1rem;border:2px solid white;margin:20px 0;">
              🔐 Reset My Password
            </a>
            <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-top:30px;">
              Link expires in 1 hour. If you didn't request this, ignore this email.
            </p>
          </div>
        </body>
        </html>
      `
    });
    return { success: true };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false };
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
