import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  getEmailConfigStatus,
  generateVerificationCode,
  sendVerificationEmail,
  testEmailTransport
} from './email-service.js';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const USERS_ACCOUNTS_PATH = path.join(DATA_DIR, 'users-accounts.json');
const USERS_TEMP_VERIFICATIONS_PATH = path.join(DATA_DIR, 'users-temp-verifications.json');
const USERS_SESSIONS_PATH = path.join(DATA_DIR, 'users-sessions.json');
const OAUTH_STATES_PATH = path.join(DATA_DIR, 'oauth-states.json');
const OWNER_ACCOUNT_PATH = path.join(DATA_DIR, 'owner-account.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  name?: string;
  passwordHash?: string;
  salt?: string;
  provider: 'email' | 'google' | 'apple';
  googleId?: string;
  appleId?: string;
  isVerified: boolean;
  role: 'user';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface TempUserVerification {
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

export interface UserSession {
  sessionId: string;
  userId: string;
  email: string;
  username: string;
  provider: string;
  role: 'user';
  createdAt: number;
  expiresAt: number;
}

interface OAuthStateRecord {
  state: string;
  provider: 'google' | 'apple';
  origin: string;
  expiresAt: number;
}

// In-memory caches with persistent disk backing
let usersCache: Record<string, UserRecord> = {};
let tempVerificationsCache: Record<string, TempUserVerification> = {};
const activeUserSessions: Map<string, UserSession> = new Map();
let oauthStatesCache: Record<string, OAuthStateRecord> = {};

function loadUsersData() {
  try {
    if (fs.existsSync(USERS_ACCOUNTS_PATH)) {
      usersCache = JSON.parse(fs.readFileSync(USERS_ACCOUNTS_PATH, 'utf-8'));
    }
    if (fs.existsSync(USERS_TEMP_VERIFICATIONS_PATH)) {
      tempVerificationsCache = JSON.parse(fs.readFileSync(USERS_TEMP_VERIFICATIONS_PATH, 'utf-8'));
    }
    if (fs.existsSync(USERS_SESSIONS_PATH)) {
      const list: UserSession[] = JSON.parse(fs.readFileSync(USERS_SESSIONS_PATH, 'utf-8'));
      const now = Date.now();
      for (const s of list) {
        if (s.expiresAt > now) {
          activeUserSessions.set(s.sessionId, s);
        }
      }
    }
    if (fs.existsSync(OAUTH_STATES_PATH)) {
      oauthStatesCache = JSON.parse(fs.readFileSync(OAUTH_STATES_PATH, 'utf-8'));
    }
  } catch (err: any) {
    console.error('[UserAuth DB] Error loading state:', err.message);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_ACCOUNTS_PATH, JSON.stringify(usersCache, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[UserAuth DB] Error saving users:', err.message);
  }
}

function saveTempVerifications() {
  try {
    fs.writeFileSync(USERS_TEMP_VERIFICATIONS_PATH, JSON.stringify(tempVerificationsCache, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[UserAuth DB] Error saving temp verifications:', err.message);
  }
}

function saveUserSessions() {
  try {
    const list = Array.from(activeUserSessions.values());
    fs.writeFileSync(USERS_SESSIONS_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[UserAuth DB] Error saving sessions:', err.message);
  }
}

function saveOAuthStates() {
  try {
    fs.writeFileSync(OAUTH_STATES_PATH, JSON.stringify(oauthStatesCache, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[UserAuth DB] Error saving oauth states:', err.message);
  }
}

loadUsersData();

// Clean up expired temp verifications and states periodically
setInterval(() => {
  const now = Date.now();
  let changedTemp = false;
  for (const [key, v] of Object.entries(tempVerificationsCache)) {
    if (v.expiresAt < now) {
      delete tempVerificationsCache[key];
      changedTemp = true;
    }
  }
  if (changedTemp) saveTempVerifications();

  let changedStates = false;
  for (const [key, s] of Object.entries(oauthStatesCache)) {
    if (s.expiresAt < now) {
      delete oauthStatesCache[key];
      changedStates = true;
    }
  }
  if (changedStates) saveOAuthStates();
}, 60000);

// Password hashing
function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// Cookie helper
function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift()!.trim()] = decodeURI(parts.join('='));
  });
  return list;
}

// Sanitized user output (never returns hash or salt!)
function sanitizeUser(u: UserRecord) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    name: u.name || u.username,
    provider: u.provider,
    isVerified: u.isVerified,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt
  };
}

export function getGoogleConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.trim() === '') {
    missing.push('GOOGLE_CLIENT_ID');
  }
  if (!process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET.trim() === '') {
    missing.push('GOOGLE_CLIENT_SECRET');
  }
  return {
    configured: missing.length === 0,
    missing
  };
}

export function getAppleConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.APPLE_CLIENT_ID || process.env.APPLE_CLIENT_ID.trim() === '') {
    missing.push('APPLE_CLIENT_ID');
  }
  if (!process.env.APPLE_TEAM_ID || process.env.APPLE_TEAM_ID.trim() === '') {
    missing.push('APPLE_TEAM_ID');
  }
  if (!process.env.APPLE_KEY_ID || process.env.APPLE_KEY_ID.trim() === '') {
    missing.push('APPLE_KEY_ID');
  }
  if (!process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY.trim() === '') {
    missing.push('APPLE_PRIVATE_KEY');
  }
  return {
    configured: missing.length === 0,
    missing
  };
}

export function createUserAuthRouter() {
  const router = express.Router();

  // 1. Authentication Provider Status Check
  router.get('/status', (req: Request, res: Response) => {
    const emailStatus = getEmailConfigStatus();
    const googleStatus = getGoogleConfigStatus();
    const appleStatus = getAppleConfigStatus();

    res.json({
      email: {
        configured: emailStatus.configured,
        missing: emailStatus.missing
      },
      google: {
        configured: googleStatus.configured,
        missing: googleStatus.missing
      },
      apple: {
        configured: appleStatus.configured,
        missing: appleStatus.missing
      }
    });
  });

  // 1b. Controlled Email Transport Diagnostic Test
  router.get('/email-diagnostic', async (req: Request, res: Response) => {
    try {
      const emailStatus = getEmailConfigStatus();
      const testRecipient = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;
      const result = await testEmailTransport(testRecipient);

      res.status(result.success ? 200 : 503).json({
        configured: emailStatus.configured,
        missing: emailStatus.missing,
        diagnostic: result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Normal User Registration - Step 1: Init with Email, Username, Password
  router.post('/register-init', async (req: Request, res: Response) => {
    try {
      const { email, username, password } = req.body;

      // 1. Username validation: 2-30 characters, letters, numbers, hyphens, underscores
      if (!username || typeof username !== 'string') {
        res.status(400).json({ error: 'Username is required.' });
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

      // 2. Email validation: valid normal emails, including Gmail
      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email address is required.' });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(normalizedEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address (e.g. user@gmail.com).' });
        return;
      }

      // 3. Password validation: minimum 8 characters
      if (!password || typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      // Check if verified account already exists for this email
      const existingUser = Object.values(usersCache).find(u => u.email === normalizedEmail && u.isVerified);
      if (existingUser) {
        res.status(400).json({
          error: 'An account with this email already exists. Please sign in.'
        });
        return;
      }

      // Check email configuration status
      const emailStatus = getEmailConfigStatus();
      if (!emailStatus.configured) {
        res.status(503).json({
          error: 'Email verification is temporarily unavailable. Please try again later.',
          code: 'EMAIL_UNAVAILABLE'
        });
        return;
      }

      // Rate limit check if a pending verification already exists for this email
      const existingPending = tempVerificationsCache[normalizedEmail];
      const now = Date.now();
      if (existingPending && existingPending.expiresAt > now) {
        if (now - existingPending.lastResendAt < 60000) {
          const waitSec = Math.ceil((60000 - (now - existingPending.lastResendAt)) / 1000);
          res.status(429).json({
            error: `Please wait ${waitSec} seconds before requesting a new verification code.`,
            code: 'RATE_LIMITED'
          });
          return;
        }
      }

      // Generate cryptographically secure 6-digit code
      const { code, codeHash } = generateVerificationCode();
      const recipientDomain = normalizedEmail.includes('@') ? '@' + normalizedEmail.split('@')[1] : 'recipient';
      console.log(`[EMAIL_DIAGNOSTIC] OTP_GENERATED: true, length=6, domain=${recipientDomain}`);
      const { hash: passwordHash, salt } = hashPassword(password);

      const tempRec: TempUserVerification = {
        email: normalizedEmail,
        username: cleanUsername,
        passwordHash,
        salt,
        codeHash,
        expiresAt: now + 10 * 60 * 1000,
        attempts: 0,
        resendCount: existingPending ? existingPending.resendCount + 1 : 1,
        lastResendAt: now
      };

      tempVerificationsCache[normalizedEmail] = tempRec;
      saveTempVerifications();
      console.log(`[EMAIL_DIAGNOSTIC] OTP_STORAGE_SUCCESS: true, domain=${recipientDomain}, expiresAt=+10m`);

      // Dispatch real email via configured SMTP
      try {
        await sendVerificationEmail(
          normalizedEmail,
          code,
          'Verify your AniVault account'
        );
      } catch (mailErr: any) {
        console.error('[UserRegisterInit] Failed to send email:', mailErr.message);
        delete tempVerificationsCache[normalizedEmail];
        saveTempVerifications();
        const safeError = mailErr.message || 'Email delivery failed.';
        res.status(503).json({
          error: safeError,
          code: 'EMAIL_SEND_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Verification code sent to your email. Please enter the code to verify your account within 10 minutes.',
        email: normalizedEmail
      });
    } catch (err: any) {
      console.error('[UserRegisterInit Error]', err);
      res.status(500).json({
        error: err.message || 'An unexpected error occurred during registration initiation.'
      });
    }
  });

  // 3. Normal User Registration - Step 2: Verify Code and Activate Account
  router.post('/register-verify', async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;

      if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
        res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const tempRec = tempVerificationsCache[normalizedEmail];

      if (!tempRec) {
        res.status(400).json({
          error: 'No active registration request found for this email, or the verification has expired. Please register again.'
        });
        return;
      }

      const now = Date.now();
      if (now > tempRec.expiresAt) {
        delete tempVerificationsCache[normalizedEmail];
        saveTempVerifications();
        res.status(400).json({
          error: 'This code has expired. Request a new code.'
        });
        return;
      }

      if (tempRec.attempts >= 5) {
        delete tempVerificationsCache[normalizedEmail];
        saveTempVerifications();
        res.status(429).json({
          error: 'Too many incorrect attempts. Please request a new verification code.'
        });
        return;
      }

      const inputCodeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
      if (inputCodeHash !== tempRec.codeHash) {
        tempRec.attempts += 1;
        saveTempVerifications();
        if (tempRec.attempts >= 5) {
          delete tempVerificationsCache[normalizedEmail];
          saveTempVerifications();
          res.status(429).json({
            error: 'Too many incorrect attempts. Please request a new verification code.'
          });
          return;
        }
        res.status(400).json({
          error: 'Incorrect verification code.'
        });
        return;
      }

      // Code is valid! Create permanent verified normal user account
      const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
      const isoNow = new Date().toISOString();

      const newUser: UserRecord = {
        id: userId,
        email: normalizedEmail,
        username: tempRec.username,
        name: tempRec.username,
        passwordHash: tempRec.passwordHash,
        salt: tempRec.salt,
        provider: 'email',
        isVerified: true,
        role: 'user',
        createdAt: isoNow,
        updatedAt: isoNow,
        lastLoginAt: isoNow
      };

      usersCache[userId] = newUser;
      saveUsers();

      // Clean up pending verification
      delete tempVerificationsCache[normalizedEmail];
      saveTempVerifications();

      // Create authenticated session
      const sessionId = crypto.randomBytes(32).toString('hex');
      const session: UserSession = {
        sessionId,
        userId: newUser.id,
        email: newUser.email,
        username: newUser.username,
        provider: 'email',
        role: 'user',
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000 // 30 days
      };

      activeUserSessions.set(sessionId, session);
      saveUserSessions();

      res.setHeader(
        'Set-Cookie',
        `anivault_user_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`
      );

      res.json({
        success: true,
        message: 'Account successfully verified and created! Welcome to AniVault.',
        user: sanitizeUser(newUser),
        sessionToken: sessionId
      });
    } catch (err: any) {
      console.error('[UserRegisterVerify Error]', err);
      res.status(500).json({ error: err.message || 'Internal error during registration verification.' });
    }
  });

  // 4. Resend Verification Code (supports both /resend-code and /register-resend)
  const handleResend = async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email address is required.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const tempRec = tempVerificationsCache[normalizedEmail];

      if (!tempRec) {
        res.status(400).json({ error: 'No active pending verification found for this email.' });
        return;
      }

      // Check email configuration status
      const emailStatus = getEmailConfigStatus();
      if (!emailStatus.configured) {
        res.status(503).json({
          error: 'Email verification is temporarily unavailable. Please try again later.',
          code: 'EMAIL_UNAVAILABLE'
        });
        return;
      }

      const now = Date.now();
      if (tempRec.resendCount >= 5) {
        res.status(429).json({
          error: 'Maximum code resend limit reached for this session. Please start registration over.'
        });
        return;
      }

      if (now - tempRec.lastResendAt < 60000) {
        const waitSec = Math.ceil((60000 - (now - tempRec.lastResendAt)) / 1000);
        res.status(429).json({
          error: `Please wait ${waitSec} seconds before requesting another code.`,
          code: 'RATE_LIMITED'
        });
        return;
      }

      const { code, codeHash } = generateVerificationCode();
      const recipientDomain = normalizedEmail.includes('@') ? '@' + normalizedEmail.split('@')[1] : 'recipient';
      console.log(`[EMAIL_DIAGNOSTIC] OTP_GENERATED: true, length=6, domain=${recipientDomain} (RESEND)`);
      tempRec.codeHash = codeHash;
      tempRec.expiresAt = now + 10 * 60 * 1000;
      tempRec.attempts = 0;
      tempRec.resendCount += 1;
      tempRec.lastResendAt = now;
      saveTempVerifications();
      console.log(`[EMAIL_DIAGNOSTIC] OTP_STORAGE_SUCCESS: true, domain=${recipientDomain}, resendCount=${tempRec.resendCount}`);

      try {
        await sendVerificationEmail(
          normalizedEmail,
          code,
          'Verify your AniVault account'
        );
      } catch (mailErr: any) {
        console.error('[UserResendCode] Failed to send email:', mailErr.message);
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
      console.error('[UserResendCode Error]', err);
      res.status(500).json({ error: err.message || 'Failed to resend verification code.' });
    }
  };

  router.post('/resend-code', handleResend);
  router.post('/register-resend', handleResend);

  // 5. Normal User Login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = Object.values(usersCache).find(u => u.email === normalizedEmail);

      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (!user.isVerified) {
        res.status(403).json({
          error: 'This account has not been verified yet. Please complete email verification.',
          code: 'UNVERIFIED_ACCOUNT'
        });
        return;
      }

      if (!user.passwordHash || !user.salt) {
        res.status(400).json({
          error: `This account was registered using ${user.provider}. Please use ${user.provider} to sign in.`
        });
        return;
      }

      const isValid = verifyPassword(password, user.passwordHash, user.salt);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const now = Date.now();
      const sessionId = crypto.randomBytes(32).toString('hex');
      const session: UserSession = {
        sessionId,
        userId: user.id,
        email: user.email,
        username: user.username,
        provider: user.provider,
        role: 'user',
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000
      };

      activeUserSessions.set(sessionId, session);
      saveUserSessions();

      user.lastLoginAt = new Date().toISOString();
      saveUsers();

      res.setHeader(
        'Set-Cookie',
        `anivault_user_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`
      );

      res.json({
        success: true,
        message: 'Signed in successfully.',
        user: sanitizeUser(user),
        sessionToken: sessionId
      });
    } catch (err: any) {
      console.error('[UserLogin Error]', err);
      res.status(500).json({ error: err.message || 'Internal login error.' });
    }
  });

  // 6. Current User Session Check
  router.get('/session', (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const sessionId = cookies.anivault_user_session || bearerToken;

    if (!sessionId) {
      res.json({ authenticated: false });
      return;
    }

    const session = activeUserSessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      if (session) activeUserSessions.delete(sessionId);
      res.json({ authenticated: false });
      return;
    }

    const user = usersCache[session.userId];
    if (!user) {
      activeUserSessions.delete(sessionId);
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      user: sanitizeUser(user)
    });
  });

  // 7. Normal User Logout
  router.post('/logout', (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const sessionId = cookies.anivault_user_session || bearerToken;

    if (sessionId) {
      activeUserSessions.delete(sessionId);
      saveUserSessions();
    }

    res.setHeader(
      'Set-Cookie',
      'anivault_user_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
    );

    res.json({ success: true, message: 'Logged out successfully.' });
  });

  // 8. Update Normal User Display Username
  router.post('/update-username', (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const sessionId = cookies.anivault_user_session || bearerToken;

    if (!sessionId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const session = activeUserSessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      res.status(401).json({ error: 'Session expired.' });
      return;
    }

    const user = usersCache[session.userId];
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters.' });
      return;
    }

    const cleanUsername = username.trim().slice(0, 30);
    // Disallow pretending to be Owner
    if (cleanUsername.toLowerCase().includes('owner') || cleanUsername.toLowerCase().includes('admin')) {
      res.status(400).json({ error: 'Restricted username prefix.' });
      return;
    }

    user.username = cleanUsername;
    user.updatedAt = new Date().toISOString();
    saveUsers();

    session.username = cleanUsername;
    activeUserSessions.set(sessionId, session);
    saveUserSessions();

    res.json({
      success: true,
      message: 'Username updated successfully.',
      user: sanitizeUser(user)
    });
  });

  // Helper to determine base URL for redirect callbacks
  function getBaseAppUrl(req: Request, clientOrigin?: string): string {
    if (clientOrigin && clientOrigin.startsWith('http')) {
      return clientOrigin.replace(/\/+$/, '');
    }
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/+$/, '');
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    return `${proto}://${host}`;
  }

  // 9. Google OAuth - Generate Authorization URL
  router.get('/google/url', (req: Request, res: Response) => {
    const status = getGoogleConfigStatus();
    if (!status.configured) {
      res.status(400).json({
        configured: false,
        error: `Google Sign-In is not configured yet. Requires environment variables: ${status.missing.join(', ')}.`,
        missing: status.missing
      });
      return;
    }

    const clientOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const baseUrl = getBaseAppUrl(req, clientOrigin);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const state = crypto.randomBytes(24).toString('hex');
    oauthStatesCache[state] = {
      state,
      provider: 'google',
      origin: baseUrl,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    saveOAuthStates();

    const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({
      configured: true,
      url: authUrl
    });
  });

  // 10. Google OAuth Callback
  router.get('/google/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    const renderHtmlResponse = (success: boolean, payload: any) => {
      res.setHeader('Content-Type', 'text/html');
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>AniVault Google Authentication</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
              .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
              h2 { margin-top: 0; color: ${success ? '#34d399' : '#f87171'}; font-size: 20px; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
              .btn { margin-top: 20px; display: inline-block; padding: 10px 24px; background: #e11d48; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; cursor: pointer; border: none; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>${success ? 'Sign-In Successful' : 'Google Authentication Notice'}</h2>
              <p>${success ? 'Your AniVault account is verified. You can close this window.' : (payload?.error || 'Authentication could not be completed.')}</p>
              <button class="btn" onclick="window.close()">Close Window</button>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({
                    type: '${success ? 'ANIVAULT_OAUTH_SUCCESS' : 'ANIVAULT_OAUTH_ERROR'}',
                    provider: 'google',
                    ${success ? `user: ${JSON.stringify(payload.user)}, sessionToken: ${JSON.stringify(payload.sessionToken)}` : `error: ${JSON.stringify(payload.error)}`}
                  }, '*');
                  setTimeout(() => { window.close(); }, 1200);
                }
              } catch (e) {
                console.error(e);
              }
            </script>
          </body>
        </html>
      `);
    };

    if (error) {
      return renderHtmlResponse(false, { error: `Google login was cancelled or denied: ${error}` });
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return renderHtmlResponse(false, { error: 'Missing OAuth authorization code or state parameter.' });
    }

    const stateRec = oauthStatesCache[state];
    if (!stateRec || stateRec.provider !== 'google' || stateRec.expiresAt < Date.now()) {
      return renderHtmlResponse(false, { error: 'Invalid or expired OAuth state parameter (CSRF protection).' });
    }

    delete oauthStatesCache[state];
    saveOAuthStates();

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
      const redirectUri = `${stateRec.origin}/api/auth/google/callback`;

      // Exchange authorization code for tokens
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });

      if (!tokenResp.ok) {
        const errJson: any = await tokenResp.json().catch(() => ({}));
        return renderHtmlResponse(false, {
          error: `Google token exchange failed: ${errJson.error_description || errJson.error || tokenResp.statusText}`
        });
      }

      const tokens: any = await tokenResp.json();
      const accessToken = tokens.access_token;

      // Query Google UserInfo
      const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!userInfoResp.ok) {
        return renderHtmlResponse(false, { error: 'Failed to retrieve Google user profile.' });
      }

      const profile: any = await userInfoResp.json();
      const googleSub = profile.sub;
      const googleEmail = profile.email?.toLowerCase();
      const googleName = profile.name || profile.given_name || 'Google User';

      if (!googleEmail) {
        return renderHtmlResponse(false, { error: 'Google did not provide a valid email address.' });
      }

      // Find existing user by googleId or verified email
      let user = Object.values(usersCache).find(
        u => (u.googleId && u.googleId === googleSub) || (u.email === googleEmail && u.isVerified)
      );

      const isoNow = new Date().toISOString();

      if (user) {
        // Link googleId if missing
        if (!user.googleId) {
          user.googleId = googleSub;
        }
        user.lastLoginAt = isoNow;
        user.updatedAt = isoNow;
      } else {
        // Create new verified normal user
        const newId = `usr_${crypto.randomBytes(8).toString('hex')}`;
        user = {
          id: newId,
          email: googleEmail,
          username: googleName.slice(0, 30),
          name: googleName,
          provider: 'google',
          googleId: googleSub,
          isVerified: true,
          role: 'user',
          createdAt: isoNow,
          updatedAt: isoNow,
          lastLoginAt: isoNow
        };
        usersCache[newId] = user;
      }

      saveUsers();

      // Create session
      const now = Date.now();
      const sessionId = crypto.randomBytes(32).toString('hex');
      const session: UserSession = {
        sessionId,
        userId: user.id,
        email: user.email,
        username: user.username,
        provider: 'google',
        role: 'user',
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000
      };

      activeUserSessions.set(sessionId, session);
      saveUserSessions();

      res.setHeader(
        'Set-Cookie',
        `anivault_user_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`
      );

      return renderHtmlResponse(true, { user: sanitizeUser(user), sessionToken: sessionId });
    } catch (err: any) {
      console.error('[GoogleCallback Error]', err);
      return renderHtmlResponse(false, { error: err.message || 'Internal error processing Google authentication.' });
    }
  });

  // 11. Apple Sign-In - Generate Authorization URL
  router.get('/apple/url', (req: Request, res: Response) => {
    const status = getAppleConfigStatus();
    if (!status.configured) {
      res.status(400).json({
        configured: false,
        error: `Apple Sign-In is not configured yet. Requires environment variables: ${status.missing.join(', ')}.`,
        missing: status.missing
      });
      return;
    }

    const clientOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const baseUrl = getBaseAppUrl(req, clientOrigin);
    const redirectUri = `${baseUrl}/api/auth/apple/callback`;

    const state = crypto.randomBytes(24).toString('hex');
    oauthStatesCache[state] = {
      state,
      provider: 'apple',
      origin: baseUrl,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    saveOAuthStates();

    const clientId = process.env.APPLE_CLIENT_ID!.trim();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code id_token',
      response_mode: 'form_post',
      scope: 'name email',
      state
    });

    const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
    res.json({
      configured: true,
      url: authUrl
    });
  });

  // 12. Apple Sign-In Callback (handles both POST form_post and GET)
  const handleAppleCallback = async (req: Request, res: Response) => {
    const code = req.body?.code || req.query?.code;
    const idToken = req.body?.id_token || req.query?.id_token;
    const state = req.body?.state || req.query?.state;
    const rawUser = req.body?.user || req.query?.user;
    const error = req.body?.error || req.query?.error;

    const renderHtmlResponse = (success: boolean, payload: any) => {
      res.setHeader('Content-Type', 'text/html');
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>AniVault Apple Authentication</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
              .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
              h2 { margin-top: 0; color: ${success ? '#34d399' : '#f87171'}; font-size: 20px; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
              .btn { margin-top: 20px; display: inline-block; padding: 10px 24px; background: #e11d48; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; cursor: pointer; border: none; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>${success ? 'Sign-In Successful' : 'Apple Authentication Notice'}</h2>
              <p>${success ? 'Your AniVault account is verified. You can close this window.' : (payload?.error || 'Authentication could not be completed.')}</p>
              <button class="btn" onclick="window.close()">Close Window</button>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({
                    type: '${success ? 'ANIVAULT_OAUTH_SUCCESS' : 'ANIVAULT_OAUTH_ERROR'}',
                    provider: 'apple',
                    ${success ? `user: ${JSON.stringify(payload.user)}, sessionToken: ${JSON.stringify(payload.sessionToken)}` : `error: ${JSON.stringify(payload.error)}`}
                  }, '*');
                  setTimeout(() => { window.close(); }, 1200);
                }
              } catch (e) {
                console.error(e);
              }
            </script>
          </body>
        </html>
      `);
    };

    if (error) {
      return renderHtmlResponse(false, { error: `Apple sign in was cancelled: ${error}` });
    }

    if (!state || typeof state !== 'string') {
      return renderHtmlResponse(false, { error: 'Missing OAuth state parameter.' });
    }

    const stateRec = oauthStatesCache[state];
    if (!stateRec || stateRec.provider !== 'apple' || stateRec.expiresAt < Date.now()) {
      return renderHtmlResponse(false, { error: 'Invalid or expired OAuth state parameter.' });
    }

    delete oauthStatesCache[state];
    saveOAuthStates();

    try {
      // Decode id_token JWT claims
      let appleSub = '';
      let appleEmail = '';

      if (idToken && typeof idToken === 'string') {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
          const claims = JSON.parse(payloadJson);
          appleSub = claims.sub || '';
          appleEmail = (claims.email || '').toLowerCase();
        }
      }

      let parsedName = 'Apple User';
      if (rawUser) {
        try {
          const userObj = typeof rawUser === 'string' ? JSON.parse(rawUser) : rawUser;
          if (userObj?.name) {
            const first = userObj.name.firstName || '';
            const last = userObj.name.lastName || '';
            parsedName = `${first} ${last}`.trim() || 'Apple User';
          }
          if (userObj?.email && !appleEmail) {
            appleEmail = userObj.email.toLowerCase();
          }
        } catch {}
      }

      if (!appleSub) {
        return renderHtmlResponse(false, { error: 'Could not extract Apple identity subject from authorization response.' });
      }

      if (!appleEmail) {
        // If Apple private relay or email not in claim, generate identity email
        appleEmail = `${appleSub.slice(0, 12)}@privaterelay.appleid.com`;
      }

      // Find existing user by appleId or verified email
      let user = Object.values(usersCache).find(
        u => (u.appleId && u.appleId === appleSub) || (u.email === appleEmail && u.isVerified)
      );

      const isoNow = new Date().toISOString();

      if (user) {
        if (!user.appleId) {
          user.appleId = appleSub;
        }
        user.lastLoginAt = isoNow;
        user.updatedAt = isoNow;
      } else {
        const newId = `usr_${crypto.randomBytes(8).toString('hex')}`;
        user = {
          id: newId,
          email: appleEmail,
          username: parsedName.slice(0, 30),
          name: parsedName,
          provider: 'apple',
          appleId: appleSub,
          isVerified: true,
          role: 'user',
          createdAt: isoNow,
          updatedAt: isoNow,
          lastLoginAt: isoNow
        };
        usersCache[newId] = user;
      }

      saveUsers();

      const now = Date.now();
      const sessionId = crypto.randomBytes(32).toString('hex');
      const session: UserSession = {
        sessionId,
        userId: user.id,
        email: user.email,
        username: user.username,
        provider: 'apple',
        role: 'user',
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000
      };

      activeUserSessions.set(sessionId, session);
      saveUserSessions();

      res.setHeader(
        'Set-Cookie',
        `anivault_user_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`
      );

      return renderHtmlResponse(true, { user: sanitizeUser(user), sessionToken: sessionId });
    } catch (err: any) {
      console.error('[AppleCallback Error]', err);
      return renderHtmlResponse(false, { error: err.message || 'Internal error processing Apple authentication.' });
    }
  };

  router.post('/apple/callback', handleAppleCallback);
  router.get('/apple/callback', handleAppleCallback);

  return router;
}
