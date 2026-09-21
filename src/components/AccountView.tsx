import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Moon,
  Sun,
  Monitor,
  CheckCircle2,
  Edit2,
  Check,
  Heart,
  Bookmark,
  LogOut,
  FolderSync,
  History,
  Trash2,
  Users,
  Database,
  Image as ImageIcon,
  RefreshCw,
  Settings,
  Activity,
  Lock
} from 'lucide-react';
import { useUserData } from '../hooks/useUserData.ts';
import {
  updateUsername,
  setThemeMode,
  logoutToGuest,
  hasGuestDataToMigrate,
  migrateGuestDataToAccount,
  clearHistory,
  getSavedAccounts,
  switchAccount
} from '../utils/userStorage.ts';
import { ThemeMode } from '../types.ts';
import { AniVaultLogo } from './AniVaultLogo.tsx';
import { OwnerLoginModal } from './OwnerLoginModal.tsx';
import { OwnerDashboardModal } from './OwnerDashboardModal.tsx';

interface AccountViewProps {
  onOpenAuthModal: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onOpenAuthModal }) => {
  const { account, userData, isGuest } = useUserData();
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(account.username || 'AnimeExplorer');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Owner System State
  const [ownerSession, setOwnerSession] = useState<{ authenticated: boolean; owner?: { email: string; username: string; role: string } } | null>(null);
  const [isOwnerLoginOpen, setIsOwnerLoginOpen] = useState(false);
  const [isOwnerDashboardOpen, setIsOwnerDashboardOpen] = useState(false);

  useEffect(() => {
    checkOwnerSession();
  }, []);

  const checkOwnerSession = async () => {
    try {
      const res = await fetch('/api/owner/session');
      if (res.ok) {
        const data = await res.json();
        setOwnerSession(data);
      }
    } catch (err) {
      console.error('Failed to check owner session', err);
    }
  };

  const handleOwnerLogout = async () => {
    try {
      await fetch('/api/owner/logout', { method: 'POST' });
      setOwnerSession({ authenticated: false });
    } catch (err) {
      console.error('Failed to log out owner', err);
    }
  };

  const handleSaveUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    updateUsername(usernameInput.trim());
    setEditingUsername(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleThemeSelect = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const isOwner = ownerSession?.authenticated && ownerSession?.owner?.role === 'owner';
  const ownerUsername = ownerSession?.owner?.username;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" id="account-view-container">
      {/* Title */}
      <div className="pb-4 border-b border-slate-800 dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white dark:text-white light:text-slate-900 tracking-tight">
            Account &amp; Preferences
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-1">
            Manage your AniVault username, persistent profile authentication, and display theme
          </p>
        </div>
        <AniVaultLogo size="lg" className="hidden sm:inline-flex" />
      </div>

      {/* Profile Overview Card */}
      <div className="bg-slate-950/80 dark:bg-slate-950/80 light:bg-white border border-slate-800 dark:border-slate-800 light:border-slate-200 rounded-2xl p-6 shadow-xl space-y-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg ${
              isOwner
                ? 'bg-gradient-to-tr from-amber-600 to-yellow-500 shadow-amber-600/30 text-slate-950'
                : 'bg-gradient-to-tr from-rose-600 to-pink-500 shadow-rose-600/30'
            }`}>
              {isOwner ? (ownerUsername || 'O').charAt(0).toUpperCase() : (account.username || account.name).charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white dark:text-white light:text-slate-900 flex items-center gap-1.5">
                  {isOwner ? (
                    <>
                      <span>{ownerUsername}</span>
                      <span className="text-amber-400 font-black tracking-wide text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                        &#123;owner&#125;
                      </span>
                    </>
                  ) : (
                    <span>{account.username || 'AnimeExplorer'}</span>
                  )}
                </h2>

                {!isOwner && (
                  <button
                    type="button"
                    id="btn-edit-username"
                    onClick={() => {
                      setUsernameInput(account.username || 'AnimeExplorer');
                      setEditingUsername(!editingUsername);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                    title="Edit username"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isOwner
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                    : account.provider === 'apple'
                    ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                    : account.provider === 'google'
                    ? 'bg-blue-950/80 text-blue-300 border border-blue-700/50'
                    : isGuest
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                    : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                }`}>
                  {isOwner ? 'Permanent Owner' : account.provider === 'apple' ? 'Apple ID' : account.provider === 'google' ? 'Google Account' : account.provider}
                </span>

                <span className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500">
                  {isOwner ? ownerSession?.owner?.email : (account.email ? account.email : 'Local Guest Session')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Owner Login Button in Settings (Requirement 1) */}
            {!isOwner && (
              <button
                type="button"
                id="btn-owner-login-trigger"
                onClick={() => setIsOwnerLoginOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40 shadow-md shadow-amber-500/10 transition-all flex items-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Owner Portal / Login</span>
              </button>
            )}

            {isGuest && !isOwner ? (
              <button
                type="button"
                id="btn-connect-account-main"
                onClick={onOpenAuthModal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition-all"
              >
                Sign In / Connect Identity
              </button>
            ) : !isOwner ? (
              <button
                type="button"
                id="btn-signout-main"
                onClick={logoutToGuest}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 light:bg-slate-100 light:hover:bg-slate-200 text-rose-400 border border-slate-800 dark:border-slate-800 light:border-slate-300 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Username Edit Form for normal users */}
        {!isOwner && editingUsername && (
          <form onSubmit={handleSaveUsername} className="p-4 bg-slate-900 dark:bg-slate-900 light:bg-slate-100 rounded-xl border border-slate-800 dark:border-slate-800 light:border-slate-300 space-y-3">
            <div className="text-xs font-bold text-white dark:text-white light:text-slate-900">
              Change Display Username
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 leading-relaxed">
              This username is shown throughout AniVault. Normal users cannot obtain the {'{owner}'} badge.
            </p>
            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                id="input-account-username"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="Enter AniVault username"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 dark:bg-slate-950 light:bg-white border border-slate-700 dark:border-slate-700 light:border-slate-300 text-xs text-white dark:text-white light:text-slate-900 focus:outline-none focus:border-rose-500"
                required
              />
              <button
                type="submit"
                id="btn-submit-account-username"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingUsername(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 dark:bg-slate-800 light:bg-slate-200 text-slate-300 dark:text-slate-300 light:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {saveSuccess && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-700/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Display username updated successfully!</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-800 dark:border-slate-800 light:border-slate-200 text-center">
          <div className="p-3 bg-slate-900 dark:bg-slate-900 light:bg-slate-50 rounded-xl border border-slate-800 dark:border-slate-800 light:border-slate-200">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-rose-500">
              <Heart className="w-4 h-4 fill-rose-500" />
              <span>{userData.favorites.length}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Favorites</div>
          </div>

          <div className="p-3 bg-slate-900 dark:bg-slate-900 light:bg-slate-50 rounded-xl border border-slate-800 dark:border-slate-800 light:border-slate-200">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-indigo-400">
              <Bookmark className="w-4 h-4 fill-indigo-400" />
              <span>{userData.watchlist.length}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Watch Later</div>
          </div>

          <div className="p-3 bg-slate-900 dark:bg-slate-900 light:bg-slate-50 rounded-xl border border-slate-800 dark:border-slate-800 light:border-slate-200">
            <div className="flex items-center justify-center gap-1 text-sm font-black text-emerald-400">
              <Check className="w-4 h-4" />
              <span>{userData.completed.length}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Watched</div>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* OWNER SECTION IN SETTINGS (Requirement 5) — ONLY FOR OWNER */}
      {/* ========================================================== */}
      {isOwner && (
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-amber-500/50 rounded-2xl p-6 shadow-2xl space-y-5 transition-colors" id="owner-settings-section">
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white tracking-wide uppercase">
                  OWNER ADMINISTRATION
                </h3>
                <p className="text-xs text-amber-300/80">
                  Authorized Owner-only system entry points &amp; security command center
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOwnerLogout}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Owner Logout</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setIsOwnerDashboardOpen(true)}
              className="p-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-500 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Owner Dashboard</div>
                  <div className="text-[11px] text-slate-400">System overview &amp; status</div>
                </div>
              </div>
            </button>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Catalogue Management</div>
                <div className="text-[11px] text-slate-400">Protected administrative view</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-pink-500/10 text-pink-400">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Artwork Management</div>
                <div className="text-[11px] text-slate-400">Posters &amp; asset registry</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Catalogue Sync</div>
                <div className="text-[11px] text-slate-400">RareToon India ingestion</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-yellow-500/10 text-yellow-400">
                <FolderSync className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Full Catalogue Import</div>
                <div className="text-[11px] text-slate-400">Batch pipeline control</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">User Management</div>
                <div className="text-[11px] text-slate-400">Roles &amp; access control</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">System Settings</div>
                <div className="text-[11px] text-slate-400">Environment &amp; runtime</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Security Settings</div>
                <div className="text-[11px] text-slate-400">Auth &amp; rate limits</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left flex items-center gap-3 opacity-90">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Audit Logs</div>
                <div className="text-[11px] text-slate-400">Telemetry &amp; access trail</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Settings Card */}
      <div className="bg-slate-950/80 dark:bg-slate-950/80 light:bg-white border border-slate-800 dark:border-slate-800 light:border-slate-200 rounded-2xl p-6 shadow-xl space-y-4 transition-colors">
        <div>
          <h3 className="text-base font-bold text-white dark:text-white light:text-slate-900">
            Display Theme
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-0.5">
            Select your preferred visual appearance. Persists immediately across sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            id="theme-btn-dark"
            onClick={() => handleThemeSelect('dark')}
            className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
              userData.theme === 'dark'
                ? 'bg-slate-900 border-rose-500 shadow-md'
                : 'bg-slate-900/60 dark:bg-slate-900/60 light:bg-slate-50 border-slate-800 dark:border-slate-800 light:border-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white dark:text-white light:text-slate-900">Dark Mode</div>
                <div className="text-[11px] text-slate-400">Deep obsidian background</div>
              </div>
            </div>
            {userData.theme === 'dark' && <Check className="w-4 h-4 text-rose-500" />}
          </button>

          <button
            type="button"
            id="theme-btn-light"
            onClick={() => handleThemeSelect('light')}
            className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
              userData.theme === 'light'
                ? 'bg-slate-100 dark:bg-slate-900 border-amber-500 shadow-md'
                : 'bg-slate-900/60 dark:bg-slate-900/60 light:bg-slate-50 border-slate-800 dark:border-slate-800 light:border-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white dark:text-white light:text-slate-900">Light Mode</div>
                <div className="text-[11px] text-slate-400">Crisp high-contrast theme</div>
              </div>
            </div>
            {userData.theme === 'light' && <Check className="w-4 h-4 text-amber-500" />}
          </button>

          <button
            type="button"
            id="theme-btn-system"
            onClick={() => handleThemeSelect('system')}
            className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
              userData.theme === 'system'
                ? 'bg-slate-900 dark:bg-slate-900 light:bg-slate-100 border-cyan-500 shadow-md'
                : 'bg-slate-900/60 dark:bg-slate-900/60 light:bg-slate-50 border-slate-800 dark:border-slate-800 light:border-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white dark:text-white light:text-slate-900">System Sync</div>
                <div className="text-[11px] text-slate-400">Matches device settings</div>
              </div>
            </div>
            {userData.theme === 'system' && <Check className="w-4 h-4 text-cyan-400" />}
          </button>
        </div>
      </div>

      {/* History & Watch Activity */}
      <div className="bg-slate-950/80 dark:bg-slate-950/80 light:bg-white border border-slate-800 dark:border-slate-800 light:border-slate-200 rounded-2xl p-6 shadow-xl space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h3 className="text-base font-bold text-white dark:text-white light:text-slate-900">
              Recently Viewed History
            </h3>
          </div>
          {userData.history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {userData.history.length === 0 ? (
          <p className="text-xs text-slate-400">No recently viewed anime yet.</p>
        ) : (
          <div className="text-xs text-slate-400">
            {userData.history.length} anime entries in your recent viewing log.
          </div>
        )}
      </div>

      {/* Owner Login Modal */}
      <OwnerLoginModal
        isOpen={isOwnerLoginOpen}
        onClose={() => setIsOwnerLoginOpen(false)}
        onLoginSuccess={(owner) => {
          setOwnerSession({ authenticated: true, owner });
          setIsOwnerLoginOpen(false);
        }}
      />

      {/* Owner Dashboard Modal */}
      <OwnerDashboardModal
        isOpen={isOwnerDashboardOpen}
        onClose={() => setIsOwnerDashboardOpen(false)}
        onLogout={handleOwnerLogout}
      />
    </div>
  );
};
