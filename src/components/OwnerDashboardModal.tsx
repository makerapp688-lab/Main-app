import React, { useState, useEffect } from 'react';
import { Shield, X, User, Mail, Lock, Settings, Database, Image as ImageIcon, Users, Activity, Terminal, RefreshCw, LogOut, CheckCircle2, AlertCircle, Loader2, Send } from 'lucide-react';

interface OwnerDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export const OwnerDashboardModal: React.FC<OwnerDashboardModalProps> = ({ isOpen, onClose, onLogout }) => {
  const [statusData, setStatusData] = useState<any>(null);
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    missing: string[];
    hostConfigured: boolean;
    userConfigured: boolean;
    passConfigured: boolean;
    fromConfigured: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; step?: string } | null>(null);
  const [testRecipient, setTestRecipient] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchOwnerStatus();
      fetchEmailStatus();
      setTestResult(null);
    }
  }, [isOpen]);

  const fetchOwnerStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/owner/status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (err) {
      console.error('Failed to fetch owner status', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailStatus = async () => {
    try {
      const res = await fetch('/api/owner/email-status');
      if (res.ok) {
        const data = await res.json();
        setEmailStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch email status', err);
    }
  };

  const handleTestEmailService = async () => {
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/owner/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: testRecipient.trim() || undefined })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.step === 'EMAIL_ACCEPTED'
            ? 'SMTP transport connection verified and test message accepted by provider.'
            : 'SMTP transport connection and authentication verified successfully.',
          step: data.step
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'SMTP test failed. Check host, credentials, or network permissions.',
          step: data.step
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to communicate with email testing endpoint.'
      });
    } finally {
      setTestingEmail(false);
    }
  };

  if (!isOpen) return null;

  const ownerInfo = statusData?.owner || { username: 'Owner', email: 'owner@anivault.system', role: 'owner' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="owner-dashboard-modal">
      <div className="relative w-full max-w-2xl bg-slate-950 border border-amber-500/30 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh] text-slate-100 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">OWNER DASHBOARD</h2>
              <p className="text-xs text-slate-400">AniVault System Administration &amp; Security Command</p>
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

        {/* Owner Profile Identity Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-500 flex items-center justify-center text-slate-950 text-xl font-black shadow-lg shadow-amber-600/30">
                {(ownerInfo.username || 'O').charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">
                    {ownerInfo.username || 'Owner'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    owner
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Email: <span className="text-slate-200 font-medium">{ownerInfo.email}</span>
                </div>
                <div className="text-xs text-slate-400">
                  Role: <span className="text-amber-400 font-semibold uppercase">Owner</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 transition-colors flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Owner Logout</span>
            </button>
          </div>
        </div>

        {/* Requirement 6: Owner-Only Email Service Status Area */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Email Service Status (Owner Diagnostics)
              </span>
            </div>
            <button
              type="button"
              onClick={fetchEmailStatus}
              className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Status</span>
            </button>
          </div>

          {/* Status Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-400 font-medium">Email Service:</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                emailStatus?.configured
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {emailStatus?.configured ? 'Configured' : 'Not Configured'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-400 font-medium">SMTP Host:</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                emailStatus?.hostConfigured
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {emailStatus?.hostConfigured ? 'Configured' : 'Missing'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-400 font-medium">SMTP User:</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                emailStatus?.userConfigured
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {emailStatus?.userConfigured ? 'Configured' : 'Missing'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-400 font-medium">SMTP Password:</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                emailStatus?.passConfigured
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {emailStatus?.passConfigured ? 'Configured' : 'Missing'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between sm:col-span-2">
              <span className="text-slate-400 font-medium">Sender Address:</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                emailStatus?.fromConfigured
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {emailStatus?.fromConfigured ? 'Configured' : 'Missing'}
              </span>
            </div>
          </div>

          {/* Test Email Service Action */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                placeholder="Optional test recipient (defaults to connection check)"
                value={testRecipient}
                onChange={e => setTestRecipient(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleTestEmailService}
                disabled={testingEmail}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-slate-950 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {testingEmail ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing SMTP...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Test Email Service</span>
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-950/80 border border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/80 border border-rose-800/60 text-rose-300'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 leading-relaxed">
                  <div className="font-semibold">{testResult.success ? 'Success' : 'Diagnostic Error'}</div>
                  <div>{testResult.message}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Authorized Owner Management Entry Points Grid */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Authorized Owner Management Entry Points
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400"><Database className="w-4 h-4" /></div>
              <div>
                <div className="text-xs font-bold text-white">Catalogue Management</div>
                <div className="text-[10px] text-slate-400">Full CRUD &amp; metadata</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400"><ImageIcon className="w-4 h-4" /></div>
              <div>
                <div className="text-xs font-bold text-white">Artwork Management</div>
                <div className="text-[10px] text-slate-400">Posters &amp; banners</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400"><RefreshCw className="w-4 h-4" /></div>
              <div>
                <div className="text-xs font-bold text-white">Catalogue Sync</div>
                <div className="text-[10px] text-slate-400">RareToon India pipeline</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><Users className="w-4 h-4" /></div>
              <div>
                <div className="text-xs font-bold text-white">User Management</div>
                <div className="text-[10px] text-slate-400">Roles &amp; permissions</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><Settings className="w-4 h-4" /></div>
              <div>
                <div className="text-xs font-bold text-white">System Settings</div>
                <div className="text-[10px] text-slate-400">Server &amp; env config</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><Activity className="w-4 h-4" /></div>
              <div>
                <div className="text-xs font-bold text-white">Security &amp; Audit Logs</div>
                <div className="text-[10px] text-slate-400">Activity telemetry</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

