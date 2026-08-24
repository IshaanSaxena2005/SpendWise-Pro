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
 * Professional, mobile-responsive design with consistent branding.
 */
function renderEmailShell({ heading, headingColor = '#6d28d9', bodyHtml, showFooter = true }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <!-- Main container -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, ${headingColor} 0%, ${headingColor}dd 100%); padding: 32px 40px; text-align: center;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                      <td style="padding-right: 12px; vertical-align: middle;">
                        <img src="https://spendwise-pro.vercel.app/logo2.png" alt="SpendWise Pro" width="40" height="40" style="display: block; border-radius: 8px;">
                      </td>
                      <td style="vertical-align: middle;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">${heading}</h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  ${bodyHtml}
                </td>
              </tr>
              ${showFooter ? `<!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="text-align: center;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
                          SpendWise Pro — Smart Personal Finance
                        </p>
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          You're receiving this because you use SpendWise Pro. 
                          <a href="#" style="color: #6d28d9; text-decoration: none;">Manage notification preferences</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
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
  
  // Determine urgency level based on usage percentage
  let urgencyMessage, urgencyColor, urgencyIcon;
  if (usagePct >= 100) {
    urgencyMessage = 'Your budget has been exceeded';
    urgencyColor = '#dc2626';
    urgencyIcon = '🚨';
  } else if (usagePct >= 90) {
    urgencyMessage = 'You\'re very close to your budget limit';
    urgencyColor = '#f59e0b';
    urgencyIcon = '⚠️';
  } else {
    urgencyMessage = 'You\'re approaching your budget limit';
    urgencyColor = '#d97706';
    urgencyIcon = '📊';
  }
  
  const bodyHtml = `
    <p style="margin: 0 0 20px 0; font-size: 16px; color: #334155;">Hi ${escapeHtml(userName || 'there')},</p>
    
    <!-- Urgency Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: ${urgencyColor}15; border-left: 4px solid ${urgencyColor}; padding: 16px 20px; border-radius: 0 8px 8px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="vertical-align: top; padding-right: 12px; font-size: 24px;">${urgencyIcon}</td>
              <td>
                <p style="margin: 0; font-size: 15px; font-weight: 600; color: ${urgencyColor};">${urgencyMessage}</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">${escapeHtml(monthLabel)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Budget Details -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 12px; padding: 4px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">${escapeHtml(label)} Budget</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${metricRow('Spent so far', formatINR(spent), '#d97706')}
            ${metricRow('Budget limit', formatINR(limit), '#1e293b')}
            ${metricRow('Remaining', formatINR(remaining), '#059669')}
          </table>
          <!-- Progress bar -->
          <div style="margin-top: 16px; background-color: #e2e8f0; border-radius: 8px; height: 8px; overflow: hidden;">
            <div style="width: ${Math.min(usagePct, 100)}%; height: 100%; background-color: ${urgencyColor}; border-radius: 8px;"></div>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8; text-align: right;">${usagePct}% used</p>
        </td>
      </tr>
    </table>
    
    <!-- Recommendation -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color: #f0fdf4; border-radius: 8px; padding: 16px 20px;">
          <p style="margin: 0; font-size: 14px; color: #166534;">
            <strong>💡 Tip:</strong> A little mindful spending now keeps you on track for the rest of the month. 
            ${usagePct >= 90 ? 'Consider pausing non-essential expenses in this category.' : ''}
          </p>
        </td>
      </tr>
    </table>
  `;
  
  const subjectLine = usagePct >= 100 
    ? `🚨 Budget Exceeded: ${label} — SpendWise Pro`
    : `⚠️ Budget Alert: ${label} at ${usagePct}% — SpendWise Pro`;
  
  try {
    await sendBrevoEmail({
      toEmail,
      subject: subjectLine,
      htmlContent: renderEmailShell({ heading: 'Budget Alert', headingColor: urgencyColor, bodyHtml }),
      logLabel: 'budget warning email',
    });
    return true;
  } catch (error) {
    console.error('Error sending budget warning email:', error.message);
    throw error;
  }
};

/**
 * Budget critical email — spending reached 90% of the limit.
 * @param {string} toEmail
 * @param {{ userName?: string, label: string, spent: number, limit: number, usagePct: number, monthLabel: string }} data
 */
const sendBudgetCriticalEmail = async (toEmail, data) => {
  const { userName, label, spent, limit, usagePct, monthLabel } = data;
  const remaining = Math.max(0, Number(limit) - Number(spent));
  
  const bodyHtml = `
    <p style="margin: 0 0 20px 0; font-size: 16px; color: #334155;">Hi ${escapeHtml(userName || 'there')},</p>
    
    <!-- Critical Warning Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 0 8px 8px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="vertical-align: top; padding-right: 12px; font-size: 24px;">⚠️</td>
              <td>
                <p style="margin: 0; font-size: 15px; font-weight: 600; color: #f59e0b;">You're very close to your budget limit</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">${escapeHtml(monthLabel)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Budget Details -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 12px; padding: 4px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">${escapeHtml(label)} Budget</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${metricRow('Spent so far', formatINR(spent), '#f59e0b')}
            ${metricRow('Budget limit', formatINR(limit), '#1e293b')}
            ${metricRow('Remaining', formatINR(remaining), '#059669')}
          </table>
          <!-- Progress bar -->
          <div style="margin-top: 16px; background-color: #e2e8f0; border-radius: 8px; height: 8px; overflow: hidden;">
            <div style="width: ${Math.min(usagePct, 100)}%; height: 100%; background-color: #f59e0b; border-radius: 8px;"></div>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #f59e0b; text-align: right; font-weight: 600;">${usagePct}% used</p>
        </td>
      </tr>
    </table>
    
    <!-- Recommendation -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color: #fffbeb; border-radius: 8px; padding: 16px 20px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>💡 Tip:</strong> You're at ${usagePct}% — consider pausing non-essential expenses in this category to avoid exceeding your budget.
          </p>
        </td>
      </tr>
    </table>
  `;
  
  try {
    await sendBrevoEmail({
      toEmail,
      subject: `⚠️ Critical: ${label} at ${usagePct}% — SpendWise Pro`,
      htmlContent: renderEmailShell({ heading: 'Budget Critical', headingColor: '#f59e0b', bodyHtml }),
      logLabel: 'budget critical email',
    });
    return true;
  } catch (error) {
    console.error('Error sending budget critical email:', error.message);
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
    <p style="margin: 0 0 20px 0; font-size: 16px; color: #334155;">Hi ${escapeHtml(userName || 'there')},</p>
    
    <!-- Critical Alert Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px 20px; border-radius: 0 8px 8px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="vertical-align: top; padding-right: 12px; font-size: 24px;">🚨</td>
              <td>
                <p style="margin: 0; font-size: 15px; font-weight: 600; color: #dc2626;">Your budget has been exceeded</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">${escapeHtml(monthLabel)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Budget Details -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 12px; padding: 4px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">${escapeHtml(label)} Budget</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${metricRow('Total spent', formatINR(spent), '#dc2626')}
            ${metricRow('Budget limit', formatINR(limit), '#1e293b')}
            ${metricRow('Over budget by', formatINR(over), '#dc2626')}
          </table>
          <!-- Progress bar (over 100%) -->
          <div style="margin-top: 16px; background-color: #e2e8f0; border-radius: 8px; height: 8px; overflow: hidden;">
            <div style="width: 100%; height: 100%; background-color: linear-gradient(90deg, #dc2626 0%, #dc2626 ${Math.min(usagePct, 150)}%, #991b1b 100%); border-radius: 8px;"></div>
          </div>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #dc2626; text-align: right; font-weight: 600;">${usagePct}% used</p>
        </td>
      </tr>
    </table>
    
    <!-- Recommendation -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color: #fffbeb; border-radius: 8px; padding: 16px 20px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>💡 What to do:</strong> Consider pausing non-essential spending in this category, or adjust your budget if your plans have changed.
          </p>
        </td>
      </tr>
    </table>
  `;
  
  try {
    await sendBrevoEmail({
      toEmail,
      subject: `🚨 Budget Exceeded: ${label} — SpendWise Pro`,
      htmlContent: renderEmailShell({ heading: 'Budget Exceeded', headingColor: '#dc2626', bodyHtml }),
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
 *           budgetStatus?: string | null, reportToken?: string, year?: number, month?: number }} data
 */
const sendMonthlyReportEmail = async (toEmail, data) => {
  const { userName, monthLabel, income, expenses, savings, topCategory, budgetStatus, reportToken, year, month } = data;
  const savingsColor = Number(savings) >= 0 ? '#059669' : '#dc2626';
  const savingsIcon = Number(savings) >= 0 ? '📈' : '📉';
  const savingsMessage = Number(savings) >= 0 
    ? 'Great job! You saved money this month.' 
    : 'Your expenses exceeded your income this month.';
  
  const topCategoryHtml = topCategory && topCategory.name
    ? `<strong>${escapeHtml(topCategory.name)}</strong> — ${formatINR(topCategory.amount)}`
    : 'No spending recorded';
  
  // Build download button URL
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const downloadUrl = reportToken 
    ? `${backendUrl}/api/reports/monthly/${reportToken}`
    : null;
  
  const bodyHtml = `
    <p style="margin: 0 0 20px 0; font-size: 16px; color: #334155;">Hi ${escapeHtml(userName || 'there')},</p>
    
    <!-- Month Header -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: #f5f3ff; border-radius: 12px; padding: 20px 24px; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 13px; color: #6d28d9; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Monthly Financial Summary</p>
          <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1e1b4b;">${escapeHtml(monthLabel)}</p>
        </td>
      </tr>
    </table>
    
    <!-- Key Metrics -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td width="33%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Income</p>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #059669;">${formatINR(income)}</p>
        </td>
        <td width="4%"></td>
        <td width="33%" style="padding: 12px; background-color: #fef2f2; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 11px; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">Expenses</p>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #dc2626;">${formatINR(expenses)}</p>
        </td>
        <td width="4%"></td>
        <td width="33%" style="padding: 12px; background-color: ${Number(savings) >= 0 ? '#f5f3ff' : '#fef2f2'}; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 11px; color: ${savingsColor}; text-transform: uppercase; letter-spacing: 0.5px;">Net Savings</p>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: ${savingsColor};">${formatINR(savings)}</p>
        </td>
      </tr>
    </table>
    
    <!-- Savings Insight -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: ${Number(savings) >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; padding: 16px 20px;">
          <p style="margin: 0; font-size: 14px; color: ${savingsColor};">
            <span style="font-size: 18px; margin-right: 8px;">${savingsIcon}</span>
            <strong>${savingsMessage}</strong>
          </p>
        </td>
      </tr>
    </table>
    
    <!-- Detailed Breakdown -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Details</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${metricRow('Top spending category', topCategoryHtml)}
            ${budgetStatus ? metricRow('Budget status', escapeHtml(budgetStatus)) : ''}
          </table>
        </td>
      </tr>
    </table>
    
    ${downloadUrl ? `
    <!-- Download Button -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td align="center">
          <a href="${downloadUrl}" style="display: inline-block; background-color: #6d28d9; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; text-align: center;">📊 Download Monthly Report</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top: 8px;">
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">Download includes detailed transaction breakdown</p>
        </td>
      </tr>
    </table>
    ` : ''}
    
    <!-- Footer Message -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color: #f8fafc; border-radius: 8px; padding: 16px 20px;">
          <p style="margin: 0; font-size: 14px; color: #64748b;">
            💡 <strong>Keep it up!</strong> Small consistent habits compound into big results. 
            Keep tracking your spending to stay on top of your finances.
          </p>
        </td>
      </tr>
    </table>
  `;
  
  try {
    await sendBrevoEmail({
      toEmail,
      subject: `📊 Your ${monthLabel} Spending Report — SpendWise Pro`,
      htmlContent: renderEmailShell({ heading: 'Monthly Report', headingColor: '#6d28d9', bodyHtml }),
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
  sendBudgetCriticalEmail,
  sendBudgetExceededEmail,
  sendMonthlyReportEmail,
  sendWeeklyInsightsEmail,
};