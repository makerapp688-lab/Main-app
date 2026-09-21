import { UserAccount, UserData, ThemeMode } from '../types.ts';

export interface StoredAccountRecord extends UserAccount {
  lastLoginAt: string;
}

const GUEST_ACCOUNT: UserAccount = {
  id: 'guest_user',
  username: 'AnimeExplorer',
  name: 'Guest Explorer',
  provider: 'guest',
  createdAt: '2025-01-01T00:00:00.000Z'
};

const DEFAULT_USER_DATA: UserData = {
  favorites: [],
  watchlist: [],
  completed: [],
  history: [],
  theme: 'dark'
};

export const STORAGE_KEYS = {
  CURRENT_SESSION: 'anivault_current_session',
  CURRENT_ACCOUNT: 'anivault_current_account',
  ACCOUNTS_DB: 'anivault_accounts_db',
  ACCOUNTS_LIST: 'anivault_accounts_list',
  GUEST_DATA: 'anivault_guest_data',
  USER_DATA_PREFIX: 'anivault_user_data_'
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (err) {
      console.error('Error notifying userStorage listener:', err);
    }
  });
}

export function subscribeUserStorage(callback: Listener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Retrieve the accounts registry from persistent storage
 */
export function getAccountsDb(): Record<string, StoredAccountRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_DB);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to parse accounts db:', err);
  }
  return {};
}

function saveAccountsDb(db: Record<string, StoredAccountRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS_DB, JSON.stringify(db));
  } catch (err) {
    console.warn('Failed to save accounts db:', err);
  }
}

/**
 * Gets the current active account. Restores session before render.
 * Guarantees that refreshing or reopening the app keeps the user signed in.
 */
export function getCurrentAccount(): UserAccount {
  try {
    // 1. Check primary current account key
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_ACCOUNT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && parsed.id !== 'guest_user') {
        return {
          id: parsed.id,
          username: parsed.username || parsed.name || 'AnimeExplorer',
          name: parsed.name || parsed.username || 'AnimeExplorer',
          email: parsed.email,
          avatar: parsed.avatar,
          provider: parsed.provider,
          createdAt: parsed.createdAt || new Date().toISOString()
        };
      }
    }

    // 2. Check session token / accountId in accounts db
    const sessionRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      if (session?.accountId && session.accountId !== 'guest_user') {
        const db = getAccountsDb();
        if (db[session.accountId]) {
          const rec = db[session.accountId];
          return {
            id: rec.id,
            username: rec.username || rec.name || 'AnimeExplorer',
            name: rec.name || rec.username,
            email: rec.email,
            avatar: rec.avatar,
            provider: rec.provider,
            createdAt: rec.createdAt
          };
        }
      }
    }

    // 3. Check if owner token exists in localStorage
    const ownerToken = localStorage.getItem('anivault_owner_session_token');
    if (ownerToken) {
      const db = getAccountsDb();
      if (db['owner_account']) {
        const rec = db['owner_account'];
        return {
          id: 'owner_account',
          username: rec.username || 'Owner',
          name: rec.name || rec.username || 'Owner',
          email: rec.email,
          provider: 'owner',
          createdAt: rec.createdAt || new Date().toISOString()
        };
      }
      return {
        id: 'owner_account',
        username: 'Owner',
        name: 'Owner',
        provider: 'owner',
        createdAt: new Date().toISOString()
      };
    }

    // 4. Check if normal user token exists in localStorage
    const userToken = localStorage.getItem('anivault_user_session_token');
    if (userToken) {
      const savedList = getSavedAccounts().filter(a => a.id !== 'guest_user');
      if (savedList.length > 0) {
        return savedList[savedList.length - 1];
      }
    }
  } catch (err) {
    console.warn('Failed to get current account:', err);
  }

  return GUEST_ACCOUNT;
}

/**
 * Update the username and persist it permanently with the user's account
 */
export function updateUsername(newUsername: string): UserAccount {
  const current = getCurrentAccount();
  const trimmed = newUsername.trim() || 'AnimeExplorer';
  const updatedAccount: UserAccount = {
    ...current,
    username: trimmed
  };

  try {
    // Update active session and account
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(updatedAccount));

    // Update in Accounts DB
    if (current.id !== 'guest_user') {
      const db = getAccountsDb();
      if (db[current.id]) {
        db[current.id].username = trimmed;
        saveAccountsDb(db);
      }
    }

    // Update in saved accounts list
    const rawList = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_LIST);
    if (rawList) {
      const list: UserAccount[] = JSON.parse(rawList);
      const updatedList = list.map(a => (a.id === updatedAccount.id ? updatedAccount : a));
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS_LIST, JSON.stringify(updatedList));
    }
  } catch (err) {
    console.warn('Failed to update username:', err);
  }

  notifyListeners();
  return updatedAccount;
}

/**
 * Retrieves isolated UserData for an account
 */
export function getUserData(accountId?: string): UserData {
  const currentId = accountId || getCurrentAccount().id;
  try {
    const key =
      currentId === 'guest_user'
        ? STORAGE_KEYS.GUEST_DATA
        : `${STORAGE_KEYS.USER_DATA_PREFIX}${currentId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        theme: parsed.theme === 'light' || parsed.theme === 'system' ? parsed.theme : 'dark'
      };
    }
  } catch (err) {
    console.warn('Failed to load user data:', err);
  }
  return { ...DEFAULT_USER_DATA };
}

/**
 * Saves isolated UserData for an account
 */
export function saveUserData(data: UserData, accountId?: string): void {
  const currentId = accountId || getCurrentAccount().id;
  try {
    const key =
      currentId === 'guest_user'
        ? STORAGE_KEYS.GUEST_DATA
        : `${STORAGE_KEYS.USER_DATA_PREFIX}${currentId}`;
    localStorage.setItem(key, JSON.stringify(data));
    notifyListeners();
  } catch (err) {
    console.warn('Failed to save user data:', err);
  }
}

export function toggleFavorite(animeId: string): boolean {
  const data = getUserData();
  const exists = data.favorites.includes(animeId);
  const updatedFavorites = exists
    ? data.favorites.filter(id => id !== animeId)
    : [...data.favorites, animeId];
  saveUserData({ ...data, favorites: updatedFavorites });
  return !exists;
}

export function toggleWatchlist(animeId: string): boolean {
  const data = getUserData();
  const exists = data.watchlist.includes(animeId);
  const updatedWatchlist = exists
    ? data.watchlist.filter(id => id !== animeId)
    : [...data.watchlist, animeId];
  saveUserData({ ...data, watchlist: updatedWatchlist });
  return !exists;
}

export function toggleCompleted(animeId: string): boolean {
  const data = getUserData();
  const exists = data.completed.includes(animeId);
  const updatedCompleted = exists
    ? data.completed.filter(id => id !== animeId)
    : [...data.completed, animeId];
  saveUserData({ ...data, completed: updatedCompleted });
  return !exists;
}

export function addToHistory(animeId: string): void {
  const data = getUserData();
  const filtered = data.history.filter(h => h.animeId !== animeId);
  const updatedHistory = [{ animeId, timestamp: Date.now() }, ...filtered].slice(0, 30);
  saveUserData({ ...data, history: updatedHistory });
}

export function clearHistory(): void {
  const data = getUserData();
  saveUserData({ ...data, history: [] });
}

export function setThemeMode(theme: ThemeMode): void {
  const data = getUserData();
  saveUserData({ ...data, theme });
  applyThemeClass(theme);
}

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function applyThemeClass(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  if (!systemThemeMediaQuery) {
    systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeHandler = () => {
      const currentTheme = getUserData().theme;
      if (currentTheme === 'system') {
        applyThemeClass('system');
      }
    };
    try {
      systemThemeMediaQuery.addEventListener('change', systemThemeHandler);
    } catch {
      systemThemeMediaQuery.addListener(systemThemeHandler);
    }
  }

  let isDark = true;
  if (theme === 'system') {
    isDark = systemThemeMediaQuery.matches;
  } else {
    isDark = theme === 'dark';
  }

  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
  }
}

export function getGuestData(): UserData {
  return getUserData('guest_user');
}

export function hasGuestDataToMigrate(): boolean {
  const guestData = getGuestData();
  return (
    guestData.favorites.length > 0 ||
    guestData.watchlist.length > 0 ||
    guestData.completed.length > 0
  );
}

export function migrateGuestDataToAccount(targetAccountId: string): {
  favoritesCount: number;
  watchlistCount: number;
  completedCount: number;
} {
  const guestData = getGuestData();
  const targetData = getUserData(targetAccountId);

  const mergedFavorites = Array.from(new Set([...targetData.favorites, ...guestData.favorites]));
  const mergedWatchlist = Array.from(new Set([...targetData.watchlist, ...guestData.watchlist]));
  const mergedCompleted = Array.from(new Set([...targetData.completed, ...guestData.completed]));

  const historyMap = new Map<string, number>();
  for (const h of [...targetData.history, ...guestData.history]) {
    if (!historyMap.has(h.animeId) || historyMap.get(h.animeId)! < h.timestamp) {
      historyMap.set(h.animeId, h.timestamp);
    }
  }
  const mergedHistory = Array.from(historyMap.entries())
    .map(([animeId, timestamp]) => ({ animeId, timestamp }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  saveUserData(
    {
      ...targetData,
      favorites: mergedFavorites,
      watchlist: mergedWatchlist,
      completed: mergedCompleted,
      history: mergedHistory
    },
    targetAccountId
  );

  // Reset guest data after migration
  saveUserData({ ...DEFAULT_USER_DATA }, 'guest_user');

  return {
    favoritesCount: mergedFavorites.length,
    watchlistCount: mergedWatchlist.length,
    completedCount: mergedCompleted.length
  };
}

/**
 * Register or Sign In with Email & Password
 */
export function authenticateWithEmail(
  email: string,
  password?: string,
  customUsername?: string
): { success: boolean; account?: UserAccount; error?: string } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const id = `user_${btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const db = getAccountsDb();
  const existing = db[id];

  if (existing) {
    // Update username if explicitly changed
    if (customUsername?.trim()) {
      existing.username = customUsername.trim();
    }
    existing.lastLoginAt = new Date().toISOString();
    db[id] = existing;
    saveAccountsDb(db);

    const userAcc: UserAccount = {
      id: existing.id,
      username: existing.username,
      name: existing.name,
      email: existing.email,
      provider: existing.provider,
      createdAt: existing.createdAt
    };

    saveSession(userAcc);
    return { success: true, account: userAcc };
  }

  // Create new account
  const defaultUsername = customUsername?.trim() || cleanEmail.split('@')[0] || 'AnimeExplorer';
  const newAccountRecord: StoredAccountRecord = {
    id,
    username: defaultUsername,
    name: cleanEmail.split('@')[0],
    email: cleanEmail,
    provider: 'email',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  db[id] = newAccountRecord;
  saveAccountsDb(db);

  const userAcc: UserAccount = {
    id: newAccountRecord.id,
    username: newAccountRecord.username,
    name: newAccountRecord.name,
    email: newAccountRecord.email,
    provider: newAccountRecord.provider,
    createdAt: newAccountRecord.createdAt
  };

  saveSession(userAcc);
  return { success: true, account: userAcc };
}

/**
 * Sign In with Verified 3P Provider (Google / Apple)
 */
export function authenticateWithProvider(
  provider: 'google' | 'apple',
  email: string,
  providerName: string,
  customUsername?: string
): { success: boolean; account: UserAccount } {
  const cleanEmail = email.trim().toLowerCase();
  const id = `${provider}_${btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const db = getAccountsDb();
  const existing = db[id];

  let chosenName = customUsername?.trim();
  if (!chosenName && existing?.username) {
    chosenName = existing.username;
  }
  if (!chosenName) {
    chosenName = cleanEmail.split('@')[0] || 'AnimeExplorer';
  }

  const accountRecord: StoredAccountRecord = {
    id,
    username: chosenName,
    name: providerName || (provider === 'google' ? 'Google User' : 'Apple User'),
    email: cleanEmail,
    provider,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  db[id] = accountRecord;
  saveAccountsDb(db);

  const userAcc: UserAccount = {
    id: accountRecord.id,
    username: accountRecord.username,
    name: accountRecord.name,
    email: accountRecord.email,
    provider: accountRecord.provider,
    createdAt: accountRecord.createdAt
  };

  saveSession(userAcc);
  return { success: true, account: userAcc };
}

/**
 * Save active session securely in localStorage
 */
function saveSession(account: UserAccount) {
  try {
    // 1. Ensure account is stored in ACCOUNTS_DB with its stable internal ID
    if (account.id && account.id !== 'guest_user') {
      const db = getAccountsDb();
      db[account.id] = {
        id: account.id,
        username: account.username || account.name || 'AnimeExplorer',
        name: account.name || account.username || 'AnimeExplorer',
        email: account.email,
        avatar: account.avatar,
        provider: account.provider,
        createdAt: account.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      saveAccountsDb(db);
    }

    localStorage.setItem(
      STORAGE_KEYS.CURRENT_SESSION,
      JSON.stringify({
        accountId: account.id,
        timestamp: Date.now()
      })
    );
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(account));

    // Save in accounts list for account switcher
    const rawList = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_LIST);
    let list: UserAccount[] = [];
    if (rawList) {
      try {
        list = JSON.parse(rawList);
      } catch {
        list = [];
      }
    }
    const filtered = list.filter(a => a.id !== account.id);
    filtered.push(account);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS_LIST, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to persist session:', err);
  }
  notifyListeners();
}

export function getSavedAccounts(): UserAccount[] {
  try {
    const db = getAccountsDb();
    const accounts = Object.values(db).map(r => ({
      id: r.id,
      username: r.username,
      name: r.name,
      email: r.email,
      avatar: r.avatar,
      provider: r.provider,
      createdAt: r.createdAt
    }));
    if (accounts.length > 0) return accounts;

    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_LIST);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return [];
}

export function switchAccount(account: UserAccount): void {
  saveSession(account);
}

/**
 * Explicit logout ending the session and returning to Guest
 */
export function logoutToGuest(): void {
  try {
    localStorage.removeItem('anivault_owner_session_token');
    localStorage.removeItem('anivault_user_session_token');
    localStorage.setItem(
      STORAGE_KEYS.CURRENT_SESSION,
      JSON.stringify({
        accountId: 'guest_user',
        timestamp: Date.now()
      })
    );
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(GUEST_ACCOUNT));
  } catch (err) {
    console.warn('Failed to log out:', err);
  }
  notifyListeners();
}

/**
 * Set active session from server verified account
 */
export function setSessionAccount(account: UserAccount, sessionToken?: string): void {
  console.log(`[SessionSync] Setting active session account for "${account.username}" (${account.id}, provider: ${account.provider})`);
  if (sessionToken) {
    try {
      if (account.provider === 'owner') {
        localStorage.setItem('anivault_owner_session_token', sessionToken);
        console.log('[SessionSync] Stored owner session token in localStorage.');
      } else {
        localStorage.setItem('anivault_user_session_token', sessionToken);
        console.log('[SessionSync] Stored user session token in localStorage.');
      }
    } catch (err) {
      console.warn('[SessionSync] Failed to store session token:', err);
    }
  }
  saveSession(account);
}

/**
 * Check and synchronize session with backend server with detailed logging and token verification
 */
export async function syncWithServerSession(): Promise<UserAccount | null> {
  console.log('[SessionSync] Starting session synchronization on app load...');
  try {
    // 1. Check Owner session first ONLY if owner token exists
    const ownerToken = localStorage.getItem('anivault_owner_session_token');
    if (ownerToken) {
      console.log('[SessionSync] Owner session token found in localStorage. Verifying with /api/owner/session...');
      const ownerHeaders: Record<string, string> = {
        'Authorization': `Bearer ${ownerToken}`,
        'x-anivault-owner-session': ownerToken
      };
      const ownerRes = await fetch('/api/owner/session', {
        headers: ownerHeaders,
        credentials: 'include'
      }).catch((err) => {
        console.warn('[SessionSync] Network error while reaching /api/owner/session:', err);
        return null;
      });

      if (ownerRes && ownerRes.ok) {
        const ownerData = await ownerRes.json().catch(() => null);
        if (ownerData && ownerData.authenticated && ownerData.owner) {
          console.log(`[SessionSync] Owner session verified successfully for user: "${ownerData.owner.username || 'Owner'}"`);
          const ownerAcc: UserAccount = {
            id: 'owner_account',
            username: ownerData.owner.username || 'Owner',
            name: ownerData.owner.username || 'Owner',
            email: ownerData.owner.email,
            provider: 'owner',
            createdAt: new Date().toISOString()
          };
          saveSession(ownerAcc);
          return ownerAcc;
        } else {
          console.warn('[SessionSync] Owner session endpoint returned unauthenticated response:', ownerData);
        }
      } else if (ownerRes) {
        console.warn(`[SessionSync] Owner session check returned HTTP status ${ownerRes.status}`);
      }
    } else {
      console.log('[SessionSync] No owner session token present in localStorage.');
    }

    // 2. Check Normal User session
    const token = localStorage.getItem('anivault_user_session_token');
    if (token) {
      console.log('[SessionSync] Normal user session token found in localStorage. Verifying with /api/auth/session...');
    } else {
      console.log('[SessionSync] Checking user session via cookies with /api/auth/session...');
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-anivault-user-session'] = token;
    }

    const res = await fetch('/api/auth/session', {
      headers,
      credentials: 'include'
    }).catch((err) => {
      console.warn('[SessionSync] Network error while reaching /api/auth/session:', err);
      return null;
    });

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.authenticated && data.user) {
        console.log(`[SessionSync] User session verified successfully for: "${data.user.username}" (${data.user.id}, provider: ${data.user.provider})`);
        const serverAcc: UserAccount = {
          id: data.user.id,
          username: data.user.username,
          name: data.user.name || data.user.username,
          email: data.user.email,
          provider: data.user.provider,
          createdAt: data.user.createdAt
        };
        if (data.sessionToken) {
          try {
            localStorage.setItem('anivault_user_session_token', data.sessionToken);
            console.log('[SessionSync] Refreshed session token in localStorage.');
          } catch {}
        }
        saveSession(serverAcc);
        return serverAcc;
      } else {
        console.warn('[SessionSync] User session endpoint returned unauthenticated response:', data);
      }
    } else if (res) {
      console.warn(`[SessionSync] User session check returned HTTP status ${res.status}`);
    }
  } catch (err) {
    console.error('[SessionSync] Exception during session synchronization:', err);
  }

  // 3. Fallback Mechanism: re-verify and restore persisted account state from localStorage
  console.log('[SessionSync] Server API check completed without active session. Checking local storage fallback...');
  const current = getCurrentAccount();
  if (current && current.id && current.id !== 'guest_user') {
    console.log(`[SessionSync] Fallback active: Restored persisted account "${current.username}" (${current.id}, provider: ${current.provider})`);
    saveSession(current);
    return current;
  }

  console.log('[SessionSync] No active session found in API or localStorage. Active account remains Guest.');
  return null;
}

/**
 * Terminate server session and local session
 */
export async function logoutFromServer(): Promise<void> {
  try {
    const ownerToken = localStorage.getItem('anivault_owner_session_token');
    if (ownerToken) {
      await fetch('/api/owner/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ownerToken}`,
          'x-anivault-owner-session': ownerToken
        },
        credentials: 'include'
      }).catch(() => {});
      localStorage.removeItem('anivault_owner_session_token');
    }

    const token = localStorage.getItem('anivault_user_session_token');
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-anivault-user-session': token
        },
        credentials: 'include'
      }).catch(() => {});
      localStorage.removeItem('anivault_user_session_token');
    }
  } catch (err) {
    console.warn('Error during server logout:', err);
  }
  logoutToGuest();
}

// Backwards compatibility aliases
export const loginWithEmail = (email: string, customUsername?: string) =>
  authenticateWithEmail(email, undefined, customUsername).account!;

export const loginWithProvider = (
  provider: 'google' | 'apple',
  email: string,
  providerName: string,
  customUsername?: string
) => authenticateWithProvider(provider, email, providerName, customUsername).account;
