import { useState } from 'react';
import { Settings, Database, Cloud, FileText, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { env } from '../../config/env';
import { testSupabaseConnection } from '../../services/supabase';
import { logger } from '../../utils/logger';

export function SettingsView() {
  const [supabaseTestStatus, setSupabaseTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setSupabaseTestStatus(null);
    const result = await testSupabaseConnection();
    setSupabaseTestStatus(result.message);
    setIsTesting(false);
  };

  const handleExportLogs = () => {
    const json = logger.exportLogsAsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos-diagnostics-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-sky-950/80 border border-sky-800/80 rounded-xl text-sky-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">System Settings &amp; Diagnostics</h2>
            <p className="text-xs text-slate-400">Database connectivity and system diagnostic controls</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supabase Status Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
            <Cloud className="w-4 h-4" />
            <span>Supabase Cloud Integration</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">Configured:</span>
              <span className={`font-bold font-mono ${env.isSupabaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {env.isSupabaseConfigured ? 'Connected' : 'Local Storage Mode'}
              </span>
            </div>

            <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">URL:</span>
              <span className="font-mono text-slate-300 truncate max-w-[180px]">
                {env.supabaseUrl || 'Local Storage Mode'}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isTesting}
            onClick={handleTestConnection}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            Test Cloud Connection
          </button>

          {supabaseTestStatus && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs flex items-start gap-2 text-slate-300">
              {supabaseTestStatus.includes('Connected') ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <span>{supabaseTestStatus}</span>
            </div>
          )}
        </div>

        {/* Local Storage & Diagnostics Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <Database className="w-4 h-4" />
            <span>Local Storage &amp; Diagnostics</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">Primary Database:</span>
              <span className="font-bold text-slate-200 font-mono">Local Transaction Database</span>
            </div>

            <div className="flex justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400">Offline Fallback:</span>
              <span className="font-bold text-emerald-400 font-mono">Active &amp; Protected</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportLogs}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30"
          >
            <FileText className="w-3.5 h-3.5" />
            Export System Logs
          </button>
        </div>
      </div>
    </div>
  );
}
