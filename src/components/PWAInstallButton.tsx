import React, { useState } from 'react';
import { Download, Smartphone, X, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
        <Check className="w-3.5 h-3.5" />
        <span>تطبيق مثبت</span>
      </div>
    );
  }

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          title="تثبيت التطبيق على الشاشة الرئيسية للهاتف للعمل بدون إنترنت"
          className={`inline-flex items-center gap-2 font-bold transition shadow-lg ${
            compact
              ? 'px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs border border-emerald-400/40'
              : 'px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm border border-emerald-400/40'
          }`}
        >
          <Download className="w-4 h-4 animate-bounce" />
          <span>تثبيت التطبيق على الهاتف</span>
        </button>
      )}

      {isIOS && !isInstallable && (
        <button
          onClick={() => setShowIOSGuide(true)}
          title="طريقة تثبيت التطبيق على آيفون"
          className={`inline-flex items-center gap-2 font-bold transition border border-sky-400/40 bg-sky-950/60 hover:bg-sky-900/60 text-sky-200 ${
            compact ? 'px-2.5 py-1.5 rounded-lg text-xs' : 'px-3 py-2 rounded-xl text-xs sm:text-sm'
          }`}
        >
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <span>تثبيت على آيفون (iOS)</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-sky-600/50 p-6 shadow-2xl text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-cyan-400" />
                تثبيت التطبيق على iPhone / iPad
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs sm:text-sm text-slate-300">
              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-xs">
                  1
                </span>
                <p>
                  اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح سفاري بالأسفل.
                </p>
              </div>
              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-xs">
                  2
                </span>
                <p>
                  مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                </p>
              </div>
              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500 text-white font-bold flex items-center justify-center text-xs">
                  3
                </span>
                <p>
                  اضغط على <strong>إضافة (Add)</strong>، وسيصبح التطبيق متاحاً على شاشتك ويعمل حتى بدون إنترنت!
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-cyan-600 hover:bg-cyan-500 py-2.5 text-xs sm:text-sm font-bold text-white transition shadow-lg"
            >
              حسناً، فهمت
            </button>
          </div>
        </div>
      )}
    </>
  );
};
