import React, { useState, useEffect } from 'react';
import { Shield, X, Mail, Lock, User, CheckCircle2, AlertCircle, ArrowRight, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { setSessionAccount } from '../utils/userStorage.ts';
import { UserAccount } from '../types.ts';

interface OwnerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (owner: { email: string; username: string; role: string }) => void;
}

export const OwnerLoginModal: React.FC<OwnerLoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'login' | 'create'>('login');
  const [createStep, setCreateStep] = useState<'form' | 'verify'>('form');

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (isOpen) {
      checkOwnerStatus();
      setError(null);
      setSuccessMsg(null);
      setShowLoginPassword(false);
      setShowSetupPassword(false);
      setActiveTab('login');
      setCreateStep('form');
    }
  }, [isOpen]);

  const checkOwnerStatus = async () => {
    try {
      const res = await fetch('/api/owner/session');
      const data = await res.json();
      setOwnerExists(!!data.ownerExists);
      setActiveTab('login');
    } catch (err) {
      console.error('Failed to check owner status', err);
    }
  };

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      if (data.sessionToken) {
        try {
          localStorage.setItem('anivault_owner_session_token', data.sessionToken);
        } catch {}
      }
      if (data.owner) {
        const ownerAcc: UserAccount = {
          id: 'owner_account',
          username: data.owner.username || 'Owner',
          name: data.owner.username || 'Owner',
          email: data.owner.email,
          provider: 'owner',
          createdAt: new Date().toISOString()
        };
        setSessionAccount(ownerAcc, data.sessionToken);
      }
      onLoginSuccess(data.owner);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupInit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // 1. Username validation
    const cleanUsername = (username || '').trim();
    if (!cleanUsername) {
      setError('Owner username is required.');
      return;
    }
    if (cleanUsername.length < 2 || cleanUsername.length > 30 || !/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      setError('Username must be between 2 and 30 characters and can only contain letters, numbers, hyphens, and underscores.');
      return;
    }

    // 2. Email validation
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      setError('Email address is required.');
      return;
    }
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Please enter a valid email address (e.g. user@gmail.com).');
      return;
    }

    // 3. Password validation
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/owner/setup-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, username: cleanUsername, password })
      });

      let data: any = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: 'Failed to parse server response.' };
      }

      if (!res.ok) {
        if (data.code === 'OWNER_ALREADY_EXISTS' || data.ownerExists) {
          setOwnerExists(true);
          setActiveTab('login');
        }
        throw new Error(data.error || 'Email verification is currently unavailable. Please try again later.');
      }
      setSuccessMsg(data.message || 'Verification code sent to email.');
      setResendCooldown(60);
      setVerificationCode('');
      setCreateStep('verify');
    } catch (err: any) {
      setError(err.message || 'Email verification is currently unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/owner/setup-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      let data: any = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: 'Failed to parse server response.' };
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend verification code.');
      }

      setSuccessMsg(data.message || 'A fresh verification code has been sent to your email.');
      setResendCooldown(60);
      setVerificationCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanCode = (verificationCode || '').trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/owner/setup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: cleanCode })
      });

      let data: any = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: 'Failed to parse server response.' };
      }

      if (!res.ok) {
        if (data.code === 'OWNER_ALREADY_EXISTS' || data.ownerExists) {
          setOwnerExists(true);
          setActiveTab('login');
        }
        throw new Error(data.error || 'Incorrect verification code.');
      }
      if (data.sessionToken) {
        try {
          localStorage.setItem('anivault_owner_session_token', data.sessionToken);
        } catch {}
      }
      if (data.owner) {
        const ownerAcc: UserAccount = {
          id: 'owner_account',
          username: data.owner.username || 'Owner',
          name: data.owner.username || 'Owner',
          email: data.owner.email,
          provider: 'owner',
          createdAt: new Date().toISOString()
        };
        setSessionAccount(ownerAcc, data.sessionToken);
      }
      setOwnerExists(true);
      onLoginSuccess(data.owner);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Incorrect verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto" id="owner-login-modal">
      <div className="relative w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 p-5 sm:p-6 space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">AniVault Owner Portal</h2>
              <p className="text-xs text-slate-400">
                {activeTab === 'login' ? 'Owner Authentication' : 'First-Time Owner Setup'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        {!ownerExists && (
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setError(null);
                setSuccessMsg(null);
                setCreateStep('form');
              }}
              className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Owner
            </button>
          </div>
        )}

        {/* Error / Success Banners */}
        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* TAB 1: OWNER LOGIN FORM */}
        {activeTab === 'login' && (
          <form noValidate onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Owner Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="owner@domain.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type={showLoginPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(p => !p)}
                  className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Login</span>}
            </button>
          </form>
        )}

        {/* TAB 2: CREATE OWNER (FIRST-TIME SETUP) */}
        {activeTab === 'create' && !ownerExists && (
          <>
            {createStep === 'form' ? (
              <form noValidate onSubmit={handleSetupInit} className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 leading-relaxed">
                  <strong>First-Time Owner Setup:</strong> AniVault supports exactly ONE Owner account. Set your username, email, and password to receive a real verification code.
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Username</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. VaultMaster"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="owner@domain.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Password (min 8 chars)</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type={showSetupPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword(p => !p)}
                      className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      aria-label={showSetupPassword ? "Hide password" : "Show password"}
                    >
                      {showSetupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {loading && (
                  <p className="text-[11px] text-center text-amber-300/80 animate-pulse pt-1">
                    Delivering verification code via SMTP. Please wait...
                  </p>
                )}
              </form>
            ) : (
              /* OTP Verification Step */
              <form noValidate onSubmit={handleSetupVerify} className="space-y-4 animate-fade-in">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 text-xs">
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>Verify your email</span>
                  </div>
                  <p className="text-slate-400 text-xs">
                    We sent a verification code to:
                  </p>
                  <p className="text-amber-400 font-mono font-bold text-xs">
                    {email}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Enter 6-digit code
                  </label>
                  <div className="relative flex justify-center items-center py-2">
                    <div className="flex gap-2 justify-center">
                      {[0, 1, 2, 3, 4, 5].map(idx => {
                        const char = verificationCode[idx] || '';
                        const isCurrent = verificationCode.length === idx;
                        return (
                          <div
                            key={idx}
                            className={`w-10 sm:w-11 h-12 rounded-xl border flex items-center justify-center text-lg font-mono font-black transition-all ${
                              char
                                ? 'border-amber-500 bg-amber-950/40 text-amber-300 shadow-sm'
                                : isCurrent
                                ? 'border-slate-400 bg-slate-900 text-white animate-pulse'
                                : 'border-slate-800 bg-slate-950 text-slate-600'
                            }`}
                          >
                            {char || '_'}
                          </div>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={verificationCode}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setVerificationCode(val);
                        setError(null);
                      }}
                      autoFocus
                      className="absolute inset-0 opacity-0 cursor-text w-full h-full"
                      aria-label="6-digit verification code"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || verificationCode.length !== 6}
                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Verify Email &amp; Create Owner</span>}
                </button>

                <div className="pt-3 border-t border-slate-800/80 text-center space-y-2">
                  <p className="text-xs text-slate-400">Didn't receive the code?</p>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0 || loading}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 'Resend Code'}
                  </button>
                  {loading && (
                    <p className="text-[11px] text-center text-amber-300/80 animate-pulse">
                      Resending code. Please wait...
                    </p>
                  )}
                </div>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateStep('form');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                  >
                    ← Back to Setup Details
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
