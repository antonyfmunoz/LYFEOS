import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

// Resend integration - never cache client, tokens expire
async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

function getBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.REPLIT_DEPLOYMENT_URL) {
    return process.env.REPLIT_DEPLOYMENT_URL;
  }
  return 'http://localhost:5000';
}

export async function sendVerificationEmail(to: string, token: string, firstName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const baseUrl = getBaseUrl();
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
    const name = firstName || 'Commander';

    await client.emails.send({
      from: fromEmail,
      to,
      subject: 'Verify your LYFEOS account',
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a1a; color: #e0e0e0; padding: 40px; border-radius: 12px; border: 1px solid #1a1a3a;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00e0ff; font-size: 28px; margin: 0;">LYFEOS</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Life Operating System</p>
          </div>
          <h2 style="color: #fff; font-size: 20px;">Welcome, ${name}!</h2>
          <p style="color: #aaa; line-height: 1.6;">Verify your email to activate your LYFEOS account and begin your journey.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background: #00e0ff; color: #0a0a1a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Verify Email</a>
          </div>
          <p style="color: #666; font-size: 13px;">Or copy this link: <a href="${verifyUrl}" style="color: #00e0ff;">${verifyUrl}</a></p>
          <p style="color: #666; font-size: 13px;">This link expires in 24 hours.</p>
          <hr style="border: none; border-top: 1px solid #1a1a3a; margin: 30px 0;" />
          <p style="color: #444; font-size: 12px; text-align: center;">If you didn't create this account, you can safely ignore this email.</p>
        </div>
      `
    });
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}

export async function send2FAVerificationEmail(to: string, code: string, firstName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const name = firstName || 'Commander';

    await client.emails.send({
      from: fromEmail,
      to,
      subject: 'LYFEOS - Email Verification Code',
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a1a; color: #e0e0e0; padding: 40px; border-radius: 12px; border: 1px solid #1a1a3a;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00e0ff; font-size: 28px; margin: 0;">LYFEOS</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Life Operating System</p>
          </div>
          <h2 style="color: #fff; font-size: 20px;">Verification Code</h2>
          <p style="color: #aaa; line-height: 1.6;">Hi ${name}, here is your email verification code for two-factor authentication setup:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #1a1a3a; border: 2px solid #00e0ff; border-radius: 12px; padding: 20px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; color: #00e0ff; letter-spacing: 8px; font-family: monospace;">${code}</span>
            </div>
          </div>
          <p style="color: #666; font-size: 13px;">This code expires in 10 minutes.</p>
          <hr style="border: none; border-top: 1px solid #1a1a3a; margin: 30px 0;" />
          <p style="color: #444; font-size: 12px; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `
    });
    return true;
  } catch (error) {
    console.error('Failed to send 2FA verification email:', error);
    return false;
  }
}

export async function send2FAVerificationSMS(to: string, code: string): Promise<boolean> {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.error('Twilio credentials not configured');
      return false;
    }

    const twilio = await import('twilio');
    const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    await client.messages.create({
      body: `Your LYFEOS verification code is: ${code}. This code expires in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    return true;
  } catch (error) {
    console.error('Failed to send 2FA SMS:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, token: string, firstName?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const baseUrl = getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    const name = firstName || 'Commander';

    await client.emails.send({
      from: fromEmail,
      to,
      subject: 'Reset your LYFEOS password',
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a1a; color: #e0e0e0; padding: 40px; border-radius: 12px; border: 1px solid #1a1a3a;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00e0ff; font-size: 28px; margin: 0;">LYFEOS</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Life Operating System</p>
          </div>
          <h2 style="color: #fff; font-size: 20px;">Password Reset Request</h2>
          <p style="color: #aaa; line-height: 1.6;">Hi ${name}, we received a request to reset your password. Click the button below to set a new one.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #00e0ff; color: #0a0a1a; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #666; font-size: 13px;">Or copy this link: <a href="${resetUrl}" style="color: #00e0ff;">${resetUrl}</a></p>
          <p style="color: #666; font-size: 13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #1a1a3a; margin: 30px 0;" />
          <p style="color: #444; font-size: 12px; text-align: center;">For security, this link can only be used once.</p>
        </div>
      `
    });
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}
