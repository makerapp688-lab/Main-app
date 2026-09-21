import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Ensure latest environment variables are loaded
dotenv.config();

export interface EmailConfigStatus {
  configured: boolean;
  missing: string[];
}

/**
 * Check if the email service has the minimum required SMTP configuration.
 * Reloads dotenv if present to ensure dynamically added env vars are detected.
 */
export function getEmailConfigStatus(): EmailConfigStatus {
  dotenv.config();

  const missing: string[] = [];
  const host = (process.env.SMTP_HOST || '').trim().replace(/^["']|["']$/g, '');
  const user = (process.env.SMTP_USER || '').trim().replace(/^["']|["']$/g, '');
  const pass = (process.env.SMTP_PASS || '').trim().replace(/^["']|["']$/g, '');

  if (!host) {
    missing.push('SMTP_HOST');
  }
  if (!user) {
    missing.push('SMTP_USER');
  }
  if (!pass) {
    missing.push('SMTP_PASS');
  }

  return {
    configured: missing.length === 0,
    missing
  };
}

/**
 * Creates and configures a nodemailer transport compliant with Gmail and standard SMTP.
 * Enforces TLS, timeouts, and authenticated connection.
 */
export function createEmailTransporter() {
  const { configured } = getEmailConfigStatus();
  if (!configured) {
    return null;
  }

  const host = process.env.SMTP_HOST!.trim().replace(/^["']|["']$/g, '');
  const portStr = (process.env.SMTP_PORT || '587').trim().replace(/^["']|["']$/g, '');
  const port = parseInt(portStr, 10) || 587;
  const user = process.env.SMTP_USER!.trim().replace(/^["']|["']$/g, '');
  let pass = process.env.SMTP_PASS!.trim().replace(/^["']|["']$/g, '');

  // Gmail 16-character App Passwords are commonly displayed in 4 space-separated groups (e.g. "abcd efgh ijkl mnop").
  // If the user pastes with spaces, strip whitespace so SMTP authentication succeeds.
  if ((host.toLowerCase().includes('gmail') || user.toLowerCase().includes('@gmail.com')) && pass.includes(' ')) {
    pass = pass.replace(/\s+/g, '');
  }

  const isSecurePort = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecurePort,
    requireTLS: !isSecurePort, // enforce STARTTLS on port 587 and others
    auth: {
      user,
      pass
    },
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    },
    connectionTimeout: 15000, // 15 seconds connection timeout
    greetingTimeout: 15000,   // 15 seconds greeting timeout
    socketTimeout: 20000      // 20 seconds socket timeout
  });
}

/**
 * Generate cryptographically secure 6-digit verification code and its SHA-256 hash.
 * Plaintext code is strictly single-use and only the hash is persisted.
 */
export function generateVerificationCode(): { code: string; codeHash: string } {
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, codeHash };
}

/**
 * Determines the authoritative From address.
 * Formats sender display name as "AniVault" with verified sender email.
 */
function resolveFromAddress(smtpUser: string): string {
  const envFrom = (process.env.SMTP_FROM || '').trim().replace(/^["']|["']$/g, '');
  
  if (envFrom) {
    const match = envFrom.match(/<([^>]+)>/);
    if (match && match[1]) {
      return `"AniVault" <${match[1].trim()}>`;
    }
    if (envFrom.includes('@')) {
      return `"AniVault" <${envFrom}>`;
    }
  }

  return `"AniVault" <${smtpUser}>`;
}

/**
 * Send real email verification code via authenticated SMTP.
 * Awaits full provider confirmation before returning success.
 * Throws clean, informative errors if delivery fails.
 */
export async function sendVerificationEmail(
  toEmail: string,
  code: string,
  subjectTitle: string = 'Verify your AniVault account'
): Promise<{ success: boolean; messageId?: string }> {
  const status = getEmailConfigStatus();
  if (!status.configured) {
    throw new Error('Email service is not configured correctly.');
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    throw new Error('Email service is not configured correctly.');
  }

  const smtpUser = process.env.SMTP_USER!.trim().replace(/^["']|["']$/g, '');
  const from = resolveFromAddress(smtpUser);

  // Generate compliant RFC 5322 Message-ID
  const userDomain = smtpUser.includes('@') ? smtpUser.split('@')[1] : 'anivault.app';
  const messageId = `<anivault-${Date.now()}-${crypto.randomBytes(6).toString('hex')}@${userDomain}>`;

  // Check for existing AniVault logo to embed inline via CID
  const candidateLogoPaths = [
    path.join(process.cwd(), 'public', 'anivault-logo.png'),
    path.join(process.cwd(), 'public', 'anivault-logo.jpg'),
    path.join(process.cwd(), 'dist', 'anivault-logo.png'),
    path.join(process.cwd(), 'dist', 'anivault-logo.jpg')
  ];

  const attachments: Array<{
    filename: string;
    path: string;
    cid: string;
    contentType: string;
    contentDisposition: 'inline';
  }> = [];

  for (const candidate of candidateLogoPaths) {
    if (fs.existsSync(candidate)) {
      attachments.push({
        filename: 'anivault-logo.png',
        path: candidate,
        cid: 'anivault-logo',
        contentType: 'image/jpeg',
        contentDisposition: 'inline'
      });
      break;
    }
  }

  // Plain text fallback
  const plainTextContent = 
`AniVault

Here’s your new account verification

Use the verification code below to verify your AniVault account.

┌─────────────────┐
│     ${code}      │
└─────────────────┘

This code expires in 10 minutes.

If you didn’t request this verification code, you can safely ignore this email.

© AniVault
This is an automated message. Please do not reply to this email.`;

  // Production-grade responsive HTML email template matching AniVault branding
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subjectTitle}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #030712; padding: 40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 500px; background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
            
            <!-- Header: AniVault Logo & Brand Name -->
            <tr>
              <td align="center" style="padding: 36px 32px 20px; text-align: center;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                  <tr>
                    <td align="center" style="padding-bottom: 12px;">
                      <img src="cid:anivault-logo" alt="AniVault Logo" width="60" height="60" style="display: block; width: 60px; height: 60px; margin: 0 auto; border-radius: 14px; border: 1px solid #334155; object-fit: cover;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <div style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; line-height: 1.2;">
                        Ani<span style="color: #f43f5e;">Vault</span>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td align="center" style="padding: 6px 32px 32px; text-align: center;">
                <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.3px; line-height: 1.35;">
                  Here’s your new account verification
                </h1>
                
                <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                  Use the verification code below to verify your AniVault account.
                </p>

                <!-- Dedicated OTP Box -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 20px auto;">
                  <tr>
                    <td align="center" style="background-color: #030712; border: 1.5px solid #f43f5e; border-radius: 12px; padding: 16px 28px; text-align: center;">
                      <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #fda4af; display: inline-block;">
                        ${code}
                      </span>
                    </td>
                  </tr>
                </table>

                <!-- Expiration -->
                <p style="color: #cbd5e1; font-size: 13px; font-weight: 600; margin: 0 0 16px 0;">
                  This code expires in 10 minutes.
                </p>

                <!-- Security Message -->
                <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
                  If you didn’t request this verification code, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <!-- Professional Footer -->
            <tr>
              <td align="center" style="padding: 20px 32px; background-color: #060911; border-top: 1px solid #1e293b; text-align: center;">
                <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; font-weight: 600;">
                  &copy; AniVault
                </p>
                <p style="font-size: 11px; color: #475569; margin: 0; line-height: 1.4;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: subjectTitle,
      messageId,
      headers: {
        'Message-ID': messageId,
        'X-Entity-Ref-ID': crypto.randomBytes(12).toString('hex'),
        'X-Mailer': 'AniVault Mailer',
        'X-Priority': '1',
        'Importance': 'High'
      },
      text: plainTextContent,
      html: htmlContent,
      attachments
    });

    if (info.rejected && info.rejected.length > 0) {
      console.error('[EmailService] Recipient rejected by SMTP provider:', info.rejected);
      throw new Error(`Email delivery was rejected by the mail provider for ${toEmail}.`);
    }

    console.log(`[EmailService] OTP delivery confirmed by provider. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error('[EmailService] SMTP send error:', {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode
    });

    // Provide safe, specific, non-leaking error messages
    if (err.code === 'EAUTH' || (err.response && err.response.includes('535'))) {
      throw new Error('Email service authentication failed. Please verify your SMTP credentials.');
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ESOCKET') {
      throw new Error('Unable to connect to email provider. Connection timed out or refused.');
    }
    if (err.message && err.message.includes('Email delivery was rejected')) {
      throw err;
    }
    if (err.message && err.message.includes('Email service is not configured correctly')) {
      throw err;
    }

    throw new Error('Failed to deliver verification email. Please check email service configuration.');
  }
}

