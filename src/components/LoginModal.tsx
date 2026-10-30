import React, { useState } from 'react';
import { ShieldCheck, UserCheck, KeyRound, Eye, EyeOff, School, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  onLogin: (id: string, pass: string) => Promise<{ success: boolean; error?: string }>;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin }) => {
  const [roleTab, setRoleTab] = useState<'teacher' | 'principal'>('teacher');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('12345');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) {
      setError('يرجى إدخال الرقم الوظيفي');
      return;
    }
    if (!password) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    setError(null);
    setLoading(true);
    const result = await onLogin(employeeId.trim(), password);
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'فشل تسجيل الدخول، يرجى التأكد من الرقم الوظيفي وكلمة المرور');
    }
  };

  const handleQuickDemo = (id: string, role: 'teacher' | 'principal') => {
    setRoleTab(role);
    setEmployeeId(id);
    setPassword('12345');
    setError(null);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900/90 border border-sky-600/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow decorative effects */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Institution Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-950 border border-sky-600/40 text-cyan-300 text-xs font-semibold mb-3">
            <School className="w-4 h-4 text-cyan-400" />
            <span>وكالة الغوث الدولية • دائرة التربية والتعليم</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            تسجيل الدخول للنظام
          </h2>
          <p className="text-sm text-sky-200/80 mt-1">
            مدرسة ذكور مدينة اربد الاعدادية الثانية (مدرسة الخطيب - فوعرا)
          </p>
        </div>

        {/* Role Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-800/80 p-1.5 rounded-2xl border border-sky-700/40 mb-6">
          <button
            type="button"
            onClick={() => {
              setRoleTab('teacher');
              setEmployeeId('');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              roleTab === 'teacher'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>دخول المعلمين</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRoleTab('principal');
              setEmployeeId('10510884'); // Pre-fill principal ID
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              roleTab === 'principal'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>دخول الإدارة (المدير)</span>
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-sm flex items-start gap-2 animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-sky-200 mb-1.5">
              الرقم الوظيفي للمعلم / المدير
            </label>
            <div className="relative">
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder={roleTab === 'principal' ? 'مثال: 10510884' : 'أدخل رقمك الوظيفي المعتمد'}
                className="w-full bg-slate-800/90 border border-sky-600/40 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 rounded-2xl px-4 py-3 text-white placeholder-slate-500 text-sm outline-none transition"
                required
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              الرقم الوظيفي المسجل في كشف أحوال الموظفين (وكالة الغوث)
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-sky-200">كلمة المرور</label>
              <span className="text-[11px] text-amber-300 font-mono">الافتراضية: 12345</span>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="w-full bg-slate-800/90 border border-sky-600/40 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 rounded-2xl px-4 py-3 text-white placeholder-slate-500 text-sm outline-none transition"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-300 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 px-4 rounded-2xl text-white font-bold text-sm shadow-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              roleTab === 'principal'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/20'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-cyan-500/20'
            } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <KeyRound className="w-4 h-4" />
            <span>{loading ? 'جارٍ التحقق...' : 'دخول إلى النظام'}</span>
          </button>
        </form>

        {/* Quick Demo Access Bar */}
        <div className="mt-6 pt-5 border-t border-sky-800/40">
          <p className="text-[11px] font-bold text-sky-300/80 mb-2.5 text-center">
            اختصارات تجريبية سريعة بنقرة واحدة (كلمة السر 12345):
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickDemo('10510884', 'principal')}
              className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold text-right transition"
            >
              <div className="font-bold">مدير المدرسة</div>
              <div className="text-[10px] text-amber-200/70">لؤي الخطيب (10510884)</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('10511588', 'teacher')}
              className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 font-semibold text-right transition"
            >
              <div className="font-bold">نائب المدير</div>
              <div className="text-[10px] text-sky-200/70">فادي ثابت (10511588)</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('10513454', 'teacher')}
              className="p-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-semibold text-right transition"
            >
              <div className="font-bold">معلم انجليزي</div>
              <div className="text-[10px] text-cyan-200/70">أحمد عبيد (10513454)</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('10541315', 'teacher')}
              className="p-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-semibold text-right transition"
            >
              <div className="font-bold">معلم حاسوب</div>
              <div className="text-[10px] text-cyan-200/70">معاذ جوابرة (10541315)</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
