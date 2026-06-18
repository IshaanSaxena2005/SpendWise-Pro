const nodemailer = require('nodemailer');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

// Set up the transporter using SMTP credentials from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com', // default to Gmail if not provided
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  family: 4,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  logger: true,
  debug: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends an email verification link to the user
 * @param {string} toEmail - Recipient email address
 * @param {string} token - Verification token
 */
const sendVerificationEmail = async (toEmail, token) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error('BACKEND_URL is required to send verification emails.');
  }
  // Use the backend API to verify the token so we don't have to build frontend routes explicitly
  // We'll create a GET endpoint that verifies the token and then redirects to the frontend with a success flag
  const verificationLink = `${backendUrl.replace(/\/$/, '')}/api/auth/verify-email/${token}`;
  
  const mailOptions = {
    from: `"SpendWise Pro" <${process.env.SMTP_USER || 'noreply@spendwisepro.com'}>`,
    to: toEmail,
    subject: 'Verify Your Email Address - SpendWise Pro',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #6d28d9; text-align: center;">Welcome to SpendWise Pro!</h2>
        <p>Thank you for signing up. Please verify your email address to complete your registration and activate your account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify My Email</a>
        </div>
        <p>If the button above does not work, you can copy and paste the following link into your browser:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">
          <a href="${verificationLink}">${verificationLink}</a>
        </p>
        <hr style="border: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          If you did not create an account with us, please ignore this email.
        </p>
      </div>
    `,
  };

  try {
    // Check if SMTP credentials are provided, otherwise log to console for development
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('----------------------------------------------------');
        console.log('SMTP credentials not configured. Verification email was not sent.');
        console.log('----------------------------------------------------');
      }
      return true;
    }

    console.log("Attempting to send verification email to:", toEmail);
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Verification email sent: ${info.messageId}`);
    }
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email. Please try again later.');
  }
};

/**
 * Sends a password reset link to the user
 * @param {string} toEmail - Recipient email address
 * @param {string} token - Reset token
 */
const sendPasswordResetEmail = async (toEmail, token) => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error('FRONTEND_URL is required to send password reset emails.');
  }
  const resetLink = `${frontendUrl}/?reset_token=${token}`;
  
  const mailOptions = {
    from: `"SpendWise Pro" <${process.env.SMTP_USER || 'noreply@spendwisepro.com'}>`,
    to: toEmail,
    subject: 'Reset Your Password - SpendWise Pro',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #6d28d9; text-align: center;">Password Reset Request</h2>
        <p>We received a request to reset your SpendWise Pro password. Click the button below to choose a new one:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>If the button above does not work, you can copy and paste the following link into your browser:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">
          <a href="${resetLink}">${resetLink}</a>
        </p>
        <p style="color: #d97706; font-weight: bold;">This link will expire in 30 minutes.</p>
        <hr style="border: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          If you did not request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>
    `,
  };

  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('----------------------------------------------------');
        console.log('SMTP credentials not configured. Password reset email was not sent.');
        console.log('----------------------------------------------------');
      }
      return true;
    }

    const info = await transporter.sendMail(mailOptions);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Password reset email sent: ${info.messageId}`);
    }
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email. Please try again later.');
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
};
