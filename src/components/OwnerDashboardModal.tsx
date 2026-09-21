import React, { useState, useEffect } from 'react';
import { Shield, X, User, Mail, Lock, Settings, Database, Image as ImageIcon, Users, Activity, Terminal, RefreshCw, LogOut } from 'lucide-react';

interface OwnerDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export const OwnerDashboardModal: React.FC<OwnerDashboardModalProps> = ({ isOpen, onClose, onLogout }) => {
  const [statusData, setStatusData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchOwnerStatus();
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

  if (!isOpen) return null;

  const ownerInfo = statusData?.owner || { username: 'Owner', email: 'owner@anivault.system', role: 'owner' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="owner-dashboard-modal">
      <div className="relative w-full max-w-2xl bg-slate-950 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-100 p-6 space-y-6">
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
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 transition-colors"
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
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 transition-colors flex items-center gap-1.5 self-start sm:self-center"
            >
              <LogOut className="w-4 h-4" />
              <span>Owner Logout</span>
            </button>
          </div>
        </div>

        {/* Owner-only Management Modules Grid (Requirement 5) */}
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
