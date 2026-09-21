import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  getEmailConfigStatus,
  generateVerificationCode,
  sendVerificationEmail,
  testEmailTransport
} from './email-service.js';

// Data file paths
const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const OWNER_ACCOUNT_PATH = path.join(DATA_DIR, 'owner-account.json');
const TEMP_SETUP_PATH = path.join(DATA_DIR, 'owner-setup-temp.json');
const TEMP_EMAIL_CHANGE_PATH = path.join(DATA_DIR, 'owner-email-change-temp.json');
const SESSIONS_PATH = path.join(DATA_DIR, 'owner-sessions.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Interfaces
export interface OwnerAccount {
  email: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
  role: 'owner';
}

export interface TempSetup {
  email: string;
  username: string;
  passwordHash: string;
  salt: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  resendCount: number;
  lastResendAt: number;
}

export interface TempEmailChange {
  ownerEmail: string;
  newEmail: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

export interface SessionData {
  sessionId: string;
  email: string;
  username: string;
  role: 'owner';
  createdAt: number;
  expiresAt: number;
}

// Password hashing using Node.js crypto (pbkdf2)
function hashPassword(password: string, salt: string = crypto.randomBytes(16).toString('hex')): { hash: string; salt: string } {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

// Load / Save Owner Account
export function getOwnerAccount(): OwnerAccount | null {
  try {
    if (fs.existsSync(OWNER_ACCOUNT_PATH)) {
      const data = fs.readFileSync(OWNER_ACCOUNT_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[OwnerAuth] Error reading owner account:', err);
  }
  return null;
}

export function saveOwnerAccount(account: OwnerAccount): void {
  fs.writeFileSync(OWNER_ACCOUNT_PATH, JSON.stringify(account, null, 2), 'utf-8');
}

// Load / Save Temp Setup
export function getTempSetup(): TempSetup | null {
  try {
    if (fs.existsSync(TEMP_SETUP_PATH)) {
      const data = fs.readFileSync(TEMP_SETUP_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[OwnerAuth] Error reading temp setup:', err);
  }
  return null;
}

export function saveTempSetup(setup: TempSetup | null): void {
  if (!setup) {
    if (fs.existsSync(TEMP_SETUP_PATH)) {
      fs.unlinkSync(TEMP_SETUP_PATH);
    }
  } else {
    fs.writeFileSync(TEMP_SETUP_PATH, JSON.stringify(setup, null, 2), 'utf-8');
  }
}

// Load / Save Temp Email Change
export function getTempEmailChange(): TempEmailChange | null {
  try {
    if (fs.existsSync(TEMP_EMAIL_CHANGE_PATH)) {
      const data = fs.readFileSync(TEMP_EMAIL_CHANGE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[OwnerAuth] Error reading temp email change:', err);
  }
  return null;
}

export function saveTempEmailChange(change: TempEmailChange | null): void {
  if (!change) {
    if (fs.existsSync(TEMP_EMAIL_CHANGE_PATH)) {
      fs.unlinkSync(TEMP_EMAIL_CHANGE_PATH);
    }
  } else {
    fs.writeFileSync(TEMP_EMAIL_CHANGE_PATH, JSON.stringify(change, null, 2), 'utf-8');
  }
}

// Sessions management
const activeSessions: Map<string, SessionData> = new Map();

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_PATH)) {
      const list: SessionData[] = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf-8'));
      const now = Date.now();
      for (const s of list) {
        if (s.expiresAt > now) {
          activeSessions.set(s.sessionId, s);
        }
      }
    }
  } catch (err) {
    console.error('[OwnerAuth] Error loading sessions:', err);
  }
}

function saveSessions() {
  try {
    const list = Array.from(activeSessions.values());
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[OwnerAuth] Error saving sessions:', err);
  }
}

// Session store loaded
loadSessions();

// Cookie helper
function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length === 2) {
      list[parts[0].trim()] = decodeURIComponent(parts[1].trim());
    }
  });
  return list;
}

// Middleware: Authenticate Session
export function authenticateSession(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const customHeader = req.headers['x-anivault-owner-session'] as string;
  const sessionId = cookies['anivault_owner_session'] || bearerToken || customHeader;

  if (!sessionId) {
    (req as any).ownerSession = null;
    return next();
  }

  const session = activeSessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    if (sessionId) {
      activeSessions.delete(sessionId);
      saveSessions();
    }
    (req as any).ownerSession = null;
    return next();
  }

  const owner = getOwnerAccount();
  if (!owner || owner.email !== session.email || owner.role !== 'owner') {
    activeSessions.delete(sessionId);
    saveSessions();
    (req as any).ownerSession = null;
    return next();
  }

  (req as any).ownerSession = session;
  next();
}

// Middleware: Require Owner
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).ownerSession;

  if (!session) {
    res.status(401).json({ error: 'Unauthorized: Authentication session required for AniVault Owner access.' });
    return;
  }

  if (session.role !== 'owner') {
    res.status(403).json({ error: 'Forbidden: Owner role required.' });
    return;
  }

  const owner = getOwnerAccount();
  if (!owner || owner.email !== session.email) {
    res.status(403).json({ error: 'Forbidden: Owner account mismatch.' });
    return;
  }

  next();
}

// Setup Express Router for Owner API
export function createOwnerRouter(): express.Router {
  const router = express.Router();

  // 0a. Owner-Only Email Service Configuration Status (No secret values returned)
  router.get('/email-status', (req: Request, res: Response) => {
    const status = getEmailConfigStatus();
    res.json({
      configured: status.configured,
      missing: status.missing,
      hostConfigured: status.hostConfigured,
      userConfigured: status.userConfigured,
      passConfigured: status.passConfigured,
      fromConfigured: status.fromConfigured
    });
  });

  // 0b. Owner-Only Real Email Transport Diagnostic Test
  router.post('/email-test', async (req: Request, res: Response) => {
    try {
      const { recipient } = req.body;
      const testRecipient = typeof recipient === 'string' && recipient.trim() ? recipient.trim() : undefined;
      const result = await testEmailTransport(testRecipient);
      res.status(result.success ? 200 : 503).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, step: 'SERVER_ERROR', error: err.message });
    }
  });

  // 0c. Public Check for Owner Existence
  router.get('/exists', (req: Request, res: Response) => {
    const owner = getOwnerAccount();
    res.json({ ownerExists: owner !== null });
  });

  // 1. Setup Init (Email, Password, Username)
  router.post('/setup-init', async (req: Request, res: Response) => {
    try {
      const { email, password, username } = req.body;

      // 1. Username validation
      if (!username || typeof username !== 'string') {
        res.status(400).json({ error: 'Owner username is required.' });
        return;
      }
      const cleanUsername = username.trim();
      const usernameRegex = /^[a-zA-Z0-9_-]{2,30}$/;
      if (!usernameRegex.test(cleanUsername)) {
        res.status(400).json({
          error: 'Username must be between 2 and 30 characters and can only contain letters, numbers, hyphens, and underscores.'
        });
        return;
      }

      // 2. Email validation
      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Valid email address is required.' });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(normalizedEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address (e.g. user@gmail.com).' });
        return;
      }

      // 3. Password validation
      if (!password || typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      const existingOwner = getOwnerAccount();

      if (existingOwner) {
        saveTempSetup(null);
        res.status(403).json({
          error: 'An Owner account already exists. Only one Owner account is allowed.',
          code: 'OWNER_ALREADY_EXISTS',
          ownerExists: true
        });
        return;
      }

      // Check email service configuration status
      const emailStatus = getEmailConfigStatus();
      if (!emailStatus.configured) {
        res.status(503).json({
          error: 'Email service is not configured. Please configure SMTP_HOST, SMTP_USER, and SMTP_PASS in server environment secrets.',
          code: 'EMAIL_NOT_CONFIGURED',
          missing: emailStatus.missing,
          hostConfigured: emailStatus.hostConfigured,
          userConfigured: emailStatus.userConfigured,
          passConfigured: emailStatus.passConfigured,
          fromConfigured: emailStatus.fromConfigured
        });
        return;
      }

      const existingTemp = getTempSetup();
      const now = Date.now();
      if (existingTemp && existingTemp.email === normalizedEmail && existingTemp.expiresAt > now) {
        if (now - existingTemp.lastResendAt < 60000) {
          const waitSec = Math.ceil((60000 - (now - existingTemp.lastResendAt)) / 1000);
          res.status(429).json({
            error: `Please wait ${waitSec} seconds before requesting another verification code.`,
            code: 'RATE_LIMITED'
          });
          return;
        }
      }

      const { hash: passwordHash, salt } = hashPassword(password);
      const { code, codeHash } = generateVerificationCode();
      const recipientDomain = normalizedEmail.includes('@') ? '@' + normalizedEmail.split('@')[1] : 'recipient';
      console.log(`[EMAIL_DIAGNOSTIC] OTP_GENERATED: true, length=6, domain=${recipientDomain} (OWNER_SETUP)`);

      const tempSetup: TempSetup = {
        email: normalizedEmail,
        username: cleanUsername,
        passwordHash,
        salt,
        codeHash,
        expiresAt: now + 10 * 60 * 1000,
        attempts: 0,
        resendCount: existingTemp && existingTemp.email === normalizedEmail ? existingTemp.resendCount + 1 : 1,
        lastResendAt: now
      };

      saveTempSetup(tempSetup);
      console.log(`[EMAIL_DIAGNOSTIC] OTP_STORAGE_SUCCESS: true, domain=${recipientDomain}, expiresAt=+10m (OWNER_SETUP)`);

      try {
        await sendVerificationEmail(normalizedEmail, code, 'Verify your AniVault account');
      } catch (mailErr: any) {
        console.error('[OwnerSetupInit] Failed to send email:', mailErr.message);
        saveTempSetup(null);
        const safeError = mailErr.message || 'Email delivery failed.';
        res.status(503).json({
          error: safeError,
          code: 'EMAIL_SEND_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Verification code sent to email. Please verify within 10 minutes.'
      });
    } catch (err: any) {
      console.error('[OwnerSetupInit Error]', err);
      res.status(500).json({ error: err.message || 'Internal server error during owner setup initialization.' });
    }
  });

  // 2. Setup Verify
  router.post('/setup-verify', async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        res.status(400).json({ error: 'Email and verification code are required.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const temp = getTempSetup();

      if (!temp || temp.email !== normalizedEmail) {
        res.status(400).json({ error: 'No active setup attempt found for this email. Please initiate setup again.' });
        return;
      }

      if (Date.now() > temp.expiresAt) {
        saveTempSetup(null);
        res.status(400).json({ error: 'This code has expired. Request a new code.' });
        return;
      }

      if (temp.attempts >= 5) {
        saveTempSetup(null);
        res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
        return;
      }

      const testCodeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      if (testCodeHash !== temp.codeHash) {
        temp.attempts += 1;
        saveTempSetup(temp);
        if (temp.attempts >= 5) {
          saveTempSetup(null);
          res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
          return;
        }
        res.status(400).json({ error: 'Incorrect verification code.' });
        return;
      }

      const existingOwner = getOwnerAccount();
      if (existingOwner) {
        saveTempSetup(null);
        res.status(403).json({
          error: 'An Owner account already exists. Only one Owner account is allowed.',
          code: 'OWNER_ALREADY_EXISTS',
          ownerExists: true
        });
        return;
      }

      const now = new Date().toISOString();
      const newOwner: OwnerAccount = {
        email: temp.email,
        username: temp.username,
        passwordHash: temp.passwordHash,
        salt: temp.salt,
        createdAt: now,
        updatedAt: now,
        role: 'owner'
      };

      saveOwnerAccount(newOwner);
      saveTempSetup(null);

      const sessionId = crypto.randomBytes(32).toString('hex');
      const sessionExpires = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const sessionData: SessionData = {
        sessionId,
        email: newOwner.email,
        username: newOwner.username,
        role: 'owner',
        createdAt: Date.now(),
        expiresAt: sessionExpires
      };

      activeSessions.set(sessionId, sessionData);
      saveSessions();

      res.setHeader(
        'Set-Cookie',
        `anivault_owner_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000; Partitioned`
      );

      res.json({
        success: true,
        message: 'Email verified successfully. Permanent Owner account created.',
        owner: { email: newOwner.email, username: newOwner.username, role: newOwner.role },
        sessionToken: sessionId
      });
    } catch (err: any) {
      console.error('[OwnerSetupVerify Error]', err);
      res.status(500).json({ error: err.message || 'Internal server error during setup verification.' });
    }
  });

  // 2b. Owner Setup Resend Code
  router.post('/setup-resend', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const normalizedEmail = (email || '').trim().toLowerCase();
      const tempSetup = getTempSetup();

      if (!tempSetup || tempSetup.email !== normalizedEmail) {
        res.status(400).json({
          error: 'No active setup session found for this email. Please restart owner setup.'
        });
        return;
      }

      const emailStatus = getEmailConfigStatus();
      if (!emailStatus.configured) {
        res.status(503).json({
          error: 'Email service is not configured. Please configure SMTP_HOST, SMTP_USER, and SMTP_PASS in server environment secrets.',
          code: 'EMAIL_NOT_CONFIGURED',
          missing: emailStatus.missing,
          hostConfigured: emailStatus.hostConfigured,
          userConfigured: emailStatus.userConfigured,
          passConfigured: emailStatus.passConfigured,
          fromConfigured: emailStatus.fromConfigured
        });
        return;
      }

      const now = Date.now();
      if (tempSetup.resendCount >= 5) {
        res.status(429).json({
          error: 'Maximum code resend limit reached for this session. Please restart owner setup.'
        });
        return;
      }

      if (now - tempSetup.lastResendAt < 60000) {
        const waitSec = Math.ceil((60000 - (now - tempSetup.lastResendAt)) / 1000);
        res.status(429).json({
          error: `Please wait ${waitSec} seconds before requesting another verification code.`,
          code: 'RATE_LIMITED'
        });
        return;
      }

      // Invalidate previous OTP and generate a new secure 6-digit OTP
      const { code, codeHash } = generateVerificationCode();
      const recipientDomain = normalizedEmail.includes('@') ? '@' + normalizedEmail.split('@')[1] : 'recipient';
      console.log(`[EMAIL_DIAGNOSTIC] OTP_GENERATED: true, length=6, domain=${recipientDomain} (OWNER_RESEND)`);
      tempSetup.codeHash = codeHash;
      tempSetup.expiresAt = now + 10 * 60 * 1000;
      tempSetup.attempts = 0;
      tempSetup.resendCount += 1;
      tempSetup.lastResendAt = now;
      saveTempSetup(tempSetup);
      console.log(`[EMAIL_DIAGNOSTIC] OTP_STORAGE_SUCCESS: true, domain=${recipientDomain}, resendCount=${tempSetup.resendCount} (OWNER_RESEND)`);

      try {
        await sendVerificationEmail(
          normalizedEmail,
          code,
          'Verify your AniVault account'
        );
      } catch (mailErr: any) {
        console.error('[OwnerSetupResend] Failed to send email:', mailErr.message);
        const safeError = mailErr.message || 'Email delivery failed.';
        res.status(503).json({
          error: safeError,
          code: 'EMAIL_SEND_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'A fresh verification code has been sent to your email.'
      });
    } catch (err: any) {
      console.error('[OwnerSetupResend Error]', err);
      res.status(500).json({ error: err.message || 'Failed to resend verification code.' });
    }
  });

  // 3. Login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const owner = getOwnerAccount();
      if (!owner || owner.email !== email.trim().toLowerCase()) {
        res.status(401).json({ error: 'Invalid owner credentials.' });
        return;
      }

      const isValid = verifyPassword(password, owner.passwordHash, owner.salt);
      if (!isValid || owner.role !== 'owner') {
        res.status(401).json({ error: 'Invalid owner credentials.' });
        return;
      }

      const sessionId = crypto.randomBytes(32).toString('hex');
      const sessionExpires = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const sessionData: SessionData = {
        sessionId,
        email: owner.email,
        username: owner.username,
        role: 'owner',
        createdAt: Date.now(),
        expiresAt: sessionExpires
      };

      activeSessions.set(sessionId, sessionData);
      saveSessions();

      res.setHeader(
        'Set-Cookie',
        `anivault_owner_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000; Partitioned`
      );

      res.json({
        success: true,
        message: 'Owner login successful.',
        owner: { email: owner.email, username: owner.username, role: owner.role },
        sessionToken: sessionId
      });
    } catch (err: any) {
      console.error('[OwnerLogin Error]', err);
      res.status(500).json({ error: err.message || 'Internal server error during owner login.' });
    }
  });

  // 4. Logout
  router.post('/logout', authenticateSession, (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const customHeader = req.headers['x-anivault-owner-session'] as string;
    const sessionId = cookies['anivault_owner_session'] || bearerToken || customHeader;

    if (sessionId) {
      activeSessions.delete(sessionId);
      saveSessions();
    }

    res.setHeader(
      'Set-Cookie',
      'anivault_owner_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0; Partitioned'
    );

    res.json({ success: true, message: 'Logged out successfully.' });
  });

  // 5. Get Session Status
  router.get('/session', authenticateSession, (req: Request, res: Response) => {
    const session = (req as any).ownerSession;
    const ownerExists = getOwnerAccount() !== null;
    const owner = getOwnerAccount();

    if (!session) {
      res.json({
        authenticated: false,
        ownerExists
      });
      return;
    }

    res.json({
      authenticated: true,
      ownerExists: true,
      owner: {
        email: session.email,
        username: owner?.username || session.username || 'Owner',
        role: session.role
      }
    });
  });

  // 6. Protected Owner Status Endpoint
  router.get('/status', authenticateSession, requireOwner, (req: Request, res: Response) => {
    const owner = getOwnerAccount();
    res.json({
      status: 'secure',
      owner: {
        email: owner?.email,
        username: owner?.username,
        role: owner?.role,
        createdAt: owner?.createdAt,
        updatedAt: owner?.updatedAt
      },
      activeSessionsCount: activeSessions.size
    });
  });

  // 7. Owner Email Change Init
  router.post('/change-email-init', authenticateSession, requireOwner, async (req: Request, res: Response) => {
    try {
      const { newEmail, currentPassword } = req.body;
      const owner = getOwnerAccount()!;

      if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
        res.status(400).json({ error: 'Valid new email address is required.' });
        return;
      }

      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required to change owner email.' });
        return;
      }

      if (!verifyPassword(currentPassword, owner.passwordHash, owner.salt)) {
        res.status(401).json({ error: 'Incorrect current password.' });
        return;
      }

      const normalizedNewEmail = newEmail.trim().toLowerCase();
      if (normalizedNewEmail === owner.email) {
        res.status(400).json({ error: 'New email must be different from current owner email.' });
        return;
      }

      const emailStatus = getEmailConfigStatus();
      if (!emailStatus.configured) {
        res.status(503).json({
          error: 'Email service is not configured correctly.',
          code: 'EMAIL_NOT_CONFIGURED',
          missing: emailStatus.missing
        });
        return;
      }

      const { code, codeHash } = generateVerificationCode();
      console.log(`[EMAIL_DIAGNOSTIC] OTP_GENERATED: true, length=6, recipient=${normalizedNewEmail} (OWNER_EMAIL_CHANGE)`);

      const emailChange: TempEmailChange = {
        ownerEmail: owner.email,
        newEmail: normalizedNewEmail,
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0
      };

      saveTempEmailChange(emailChange);
      console.log(`[EMAIL_DIAGNOSTIC] OTP_STORAGE_SUCCESS: true, recipient=${normalizedNewEmail}, expiresAt=+10m (OWNER_EMAIL_CHANGE)`);

      try {
        await sendVerificationEmail(normalizedNewEmail, code, 'Verify your AniVault account');
      } catch (mailErr: any) {
        console.error('[OwnerEmailChange] Failed to send email:', mailErr.message);
        saveTempEmailChange(null);
        res.status(503).json({
          error: mailErr.message || 'We couldn’t send the verification email. Please try again.',
          code: 'EMAIL_SEND_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Verification code sent to your new email address.'
      });
    } catch (err: any) {
      console.error('[OwnerEmailChangeInit Error]', err);
      res.status(500).json({ error: err.message || 'Internal server error during email change initiation.' });
    }
  });

  // 8. Owner Email Change Verify
  router.post('/change-email-verify', authenticateSession, requireOwner, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      const owner = getOwnerAccount()!;
      const tempChange = getTempEmailChange();

      if (!code || !tempChange || tempChange.ownerEmail !== owner.email) {
        res.status(400).json({ error: 'No active email change request found.' });
        return;
      }

      if (Date.now() > tempChange.expiresAt) {
        saveTempEmailChange(null);
        res.status(400).json({ error: 'Email change verification code has expired.' });
        return;
      }

      const testCodeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      if (testCodeHash !== tempChange.codeHash) {
        tempChange.attempts += 1;
        saveTempEmailChange(tempChange);
        res.status(400).json({ error: 'Invalid verification code.' });
        return;
      }

      owner.email = tempChange.newEmail;
      owner.updatedAt = new Date().toISOString();
      saveOwnerAccount(owner);
      saveTempEmailChange(null);

      res.json({
        success: true,
        message: 'Permanent Owner email updated successfully.',
        owner: { email: owner.email, username: owner.username, role: owner.role }
      });
    } catch (err: any) {
      console.error('[OwnerEmailChangeVerify Error]', err);
      res.status(500).json({ error: err.message || 'Internal server error during email change verification.' });
    }
  });

  return router;
}
