const { BrevoClient } = require('@getbrevo/brevo');

const SENDER_NAME = 'SpendWise Pro';
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'spendwisepro5@gmail.com';

const hasBrevoApiKey = Boolean(process.env.BREVO_API_KEY);
console.log(`BREVO_API_KEY exists: ${hasBrevoApiKey}`);

let brevoClient = null;

function getBrevoClient() {
  if (!process.env.BREVO_API_KEY) {
    return null;
  }
  if (!brevoClient) {
    brevoClient = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
  }
  return brevoClient;
}

/**
 * @param {{ toEmail: string, subject: string, htmlContent: string, logLabel: string }} options
 */
async function sendBrevoEmail({ toEmail, subject, htmlContent, logLabel }) {
  const client = getBrevoClient();

  if (!client) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('----------------------------------------------------');
      console.log(`BREVO_API_KEY not configured. ${logLabel} was not sent.`);
      console.log('----------------------------------------------------');
      return true;
    }
    throw new Error('BREVO_API_KEY is not configured.');
  }

  console.log(`Sending ${logLabel} to:`, toEmail);

  try {
    const response = await client.transactionalEmails.sendTransacEmail({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    });

    console.log('Brevo response:', JSON.stringify(response, null, 2));
    return true;
  } catch (error) {
    console.error('Brevo error:', {
      message: error.message,
      statusCode: error.statusCode,
      body: error.body,
      raw: error,
    });
    throw error;
  }
}

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

  const verificationLink = `${backendUrl.replace(/\/$/, '')}/api/auth/verify-email/${token}`;

  const htmlContent = `
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
    `;

  try {
    await sendBrevoEmail({
      toEmail,
      subject: 'Verify Your Email Address - SpendWise Pro',
      htmlContent,
      logLabel: 'verification email',
    });
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

  const resetLink = `${frontendUrl}/?reset_token=${token}&email=${encodeURIComponent(toEmail)}`;

  const htmlContent = `
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
    `;

  try {
    await sendBrevoEmail({
      toEmail,
      subject: 'Reset Your Password - SpendWise Pro',
      htmlContent,
      logLabel: 'password reset email',
    });
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email. Please try again later.');
  }
};

// ── Notification email helpers ───────────────────────────────────────────────

/** Format a number as Indian Rupees, e.g. 12500 -> "₹12,500". */
function formatINR(value) {
  const n = Number(value) || 0;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** Escape user-supplied text before embedding into HTML email bodies. */
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap inner HTML in the shared SpendWise Pro branded shell so every
 * notification email looks consistent with the verification/reset emails.
 */
function renderEmailShell({ heading, headingColor = '#6d28d9', bodyHtml }) {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: ${headingColor}; text-align: center;">${heading}</h2>
        ${bodyHtml}
        <hr style="border: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">
          You're receiving this because you use SpendWise Pro. Manage alerts anytime from your dashboard.
        </p>
      </div>
    `;
}

/** Small key/value metric row used across the report emails. */
function metricRow(label, valueHtml, valueColor = '#111') {
  return `
    <tr>
      <td style="padding: 8px 0; color: #666; font-size: 14px;">${escapeHtml(label)}</td>
      <td style="padding: 8px 0; text-align: right; font-size: 14px; font-weight: bold; color: ${valueColor};">${valueHtml}</td>
    </tr>`;
}

/**
 * Budget warning email — spending crossed the configured threshold (default 80%).
 * @param {string} toEmail
 * @param {{ userName?: string, label: string, spent: number, limit: number, usagePct: number, monthLabel: string }} data
 */
const sendBudgetWarningEmail = async (toEmail, data) => {
  const { userName, label, spent, limit, usagePct, monthLabel } = data;
  const remaining = Math.max(0, Number(limit) - Number(spent));
  const bodyHtml = `
    <p>Hi ${escapeHtml(userName || 'there')},</p>
    <p>Heads up — you've used <strong>${usagePct}%</strong> of your
       <strong>${escapeHtml(label)}</strong> budget for <strong>${escapeHtml(monthLabel)}</strong>.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      ${metricRow('Spent so far', formatINR(spent), '#d97706')}
      ${metricRow('Budget limit', formatINR(limit))}
      ${metricRow('Remaining', formatINR(remaining), '#059669')}
    </table>
    <p style="color: #666; font-size: 14px;">A little mindful spending now keeps you on track for the rest of the month.</p>
  `;
  try {
    await sendBrevoEmail({
      toEmail,
      subject: `⚠️ Budget Alert: ${label} at ${usagePct}% — SpendWise Pro`,
      htmlContent: renderEmailShell({ heading: '⚠️ Budget Warning', headingColor: '#d97706', bodyHtml }),
      logLabel: 'budget warning email',
    });
    return true;
  } catch (error) {
    console.error('Error sending budget warning email:', error.message);
    throw error;
  }
};

/**
 * Budget exceeded email — spending went over 100% of the limit.
 * @param {string} toEmail
 * @param {{ userName?: string, label: string, spent: number, limit: number, usagePct: number, monthLabel: string }} data
 */
const sendBudgetExceededEmail = async (toEmail, data) => {
  const { userName, label, spent, limit, usagePct, monthLabel } = data;
  const over = Math.max(0, Number(spent) - Number(limit));
  const bodyHtml = `
    <p>Hi ${escapeHtml(userName || 'there')},</p>
    <p>Your <strong>${escapeHtml(label)}</strong> budget for <strong>${escapeHtml(monthLabel)}</strong>
       has been <strong style="color:#dc2626;">exceeded</strong> (${usagePct}% used).</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      ${metricRow('Spent', formatINR(spent), '#dc2626')}
      ${metricRow('Budget limit', formatINR(limit))}
      ${metricRow('Over budget by', formatINR(over), '#dc2626')}
    </table>
    <p style="color: #666; font-size: 14px;">Consider pausing non-essential spending in this category, or adjust the budget if your plans have changed.</p>
  `;
  try {
    await sendBrevoEmail({
      toEmail,
      subject: `🚨 Budget Exceeded: ${label} — SpendWise Pro`,
      htmlContent: renderEmailShell({ heading: '🚨 Budget Exceeded', headingColor: '#dc2626', bodyHtml }),
      logLabel: 'budget exceeded email',
    });
    return true;
  } catch (error) {
    console.error('Error sending budget exceeded email:', error.message);
    throw error;
  }
};

/**
 * Monthly spending report email.
 * @param {string} toEmail
 * @param {{ userName?: string, monthLabel: string, income: number, expenses: number,
 *           savings: number, topCategory?: { name: string, amount: number } | null,
 *           budgetStatus?: string | null }} data
 */
const sendMonthlyReportEmail = async (toEmail, data) => {
  const { userName, monthLabel, income, expenses, savings, topCategory, budgetStatus } = data;
  const savingsColor = Number(savings) >= 0 ? '#059669' : '#dc2626';
  const topCategoryHtml = topCategory && topCategory.name
    ? `${escapeHtml(topCategory.name)} — ${formatINR(topCategory.amount)}`
    : '—';
  const bodyHtml = `
    <p>Hi ${escapeHtml(userName || 'there')},</p>
    <p>Here's your money summary for <strong>${escapeHtml(monthLabel)}</strong>.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      ${metricRow('Total income', formatINR(income), '#059669')}
      ${metricRow('Total expenses', formatINR(expenses), '#dc2626')}
      ${metricRow('Net savings', formatINR(savings), savingsColor)}
      ${metricRow('Top spending category', topCategoryHtml)}
      ${budgetStatus ? metricRow('Budget status', escapeHtml(budgetStatus)) : ''}
    </table>
    <p style="color: #666; font-size: 14px;">Keep it up! Small consistent habits compound into big results.</p>
  `;
  try {
    await sendBrevoEmail({
      toEmail,
      subject: `📊 Your ${monthLabel} Spending Report — SpendWise Pro`,
      htmlContent: renderEmailShell({ heading: '📊 Monthly Spending Report', bodyHtml }),
      logLabel: 'monthly report email',
    });
    return true;
  } catch (error) {
    console.error('Error sending monthly report email:', error.message);
    throw error;
  }
};

/**
 * AI weekly insights email.
 * @param {string} toEmail
 * @param {{ userName?: string, weekLabel: string, summary: string,
 *           insights?: string[], tips?: string[] }} data
 */
const sendWeeklyInsightsEmail = async (toEmail, data) => {
  const { userName, weekLabel, summary, insights = [], tips = [] } = data;
  const listHtml = (items) => items.length
    ? `<ul style="padding-left: 20px; color: #444; font-size: 14px; line-height: 1.7;">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    : '';
  const bodyHtml = `
    <p>Hi ${escapeHtml(userName || 'there')},</p>
    <p style="color:#444; font-size:14px; line-height:1.7;">${escapeHtml(summary)}</p>
    ${insights.length ? `<h3 style="color:#6d28d9; font-size:15px; margin-top:24px;">What we noticed</h3>${listHtml(insights)}` : ''}
    ${tips.length ? `<h3 style="color:#059669; font-size:15px; margin-top:24px;">Ways to save</h3>${listHtml(tips)}` : ''}
    <p style="color: #999; font-size: 12px; margin-top: 20px;">Insights for ${escapeHtml(weekLabel)}. Generated to help you spend intentionally — not financial advice.</p>
  `;
  try {
    await sendBrevoEmail({
      toEmail,
      subject: '🧠 Your Weekly Money Insights — SpendWise Pro',
      htmlContent: renderEmailShell({ heading: '🧠 Weekly Money Insights', bodyHtml }),
      logLabel: 'weekly insights email',
    });
    return true;
  } catch (error) {
    console.error('Error sending weekly insights email:', error.message);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBudgetWarningEmail,
  sendBudgetExceededEmail,
  sendMonthlyReportEmail,
  sendWeeklyInsightsEmail,
};