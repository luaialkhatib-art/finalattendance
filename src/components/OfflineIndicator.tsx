import React, { useState } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle, CloudUpload } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

interface OfflineIndicatorProps {
  pendingCount: number;
  onManualSync?: () => Promise<void>;
  isSyncing?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  pendingCount,
  onManualSync,
  isSyncing = false,
}) => {
  const isOnline = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  // If online and no pending items, display nothing unless there's an active sync
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div
      className={`w-full py-2 px-4 text-xs sm:text-sm font-semibold transition-all duration-300 flex items-center justify-between gap-3 shadow-md border-b ${
        !isOnline
          ? 'bg-amber-950/90 border-amber-600/50 text-amber-200'
          : pendingCount > 0
          ? 'bg-sky-950/90 border-cyan-500/50 text-cyan-200'
          : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
      }`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        {!isOnline ? (
          <>
            <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
              <WifiOff className="w-4 h-4" />
            </span>
            <div className="truncate">
              <span className="font-bold text-amber-300">وضع عدم الاتصال (أوفلاين):</span>{' '}
              <span className="text-amber-100/90">
                يمكن للمعلم تسجيل الحضور والغياب طبيعياً، ويُحفظ التسجيل بأمان على الهاتف لحين عودة النت.
              </span>
            </div>
          </>
        ) : isSyncing ? (
          <>
            <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </span>
            <div>
              <span className="font-bold text-cyan-300">جاري المزامنة مع الخادم...</span>{' '}
              <span className="text-cyan-100/80">يتم رفع التسجيلات المحفوظة محلياً.</span>
            </div>
          </>
        ) : (
          <>
            <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Wifi className="w-4 h-4" />
            </span>
            <div>
              <span className="font-bold text-emerald-300">تم استعادة الاتصال بالإنترنت!</span>{' '}
              {pendingCount > 0 && (
                <span className="text-emerald-100">
                  يوجد {pendingCount} تسجيل بانتظار الرفع.
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/80 border border-amber-500/40 text-amber-300 font-mono text-xs">
            <CloudUpload className="w-3.5 h-3.5" />
            <span>{pendingCount} بانتظار المزامنة</span>
          </span>
        )}

        {isOnline && pendingCount > 0 && onManualSync && (
          <button
            onClick={onManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>مزامنة الآن</span>
          </button>
        )}
      </div>
    </div>
  );
};
