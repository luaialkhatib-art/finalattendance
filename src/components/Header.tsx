import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  LogOut,
  MapPin,
  RefreshCw,
  Shield,
  User,
  Wifi,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { NotificationItem, Teacher, GeofenceSettings } from '../types.ts';
import { formatTimeArabic } from '../utils/export.ts';

interface HeaderProps {
  currentUser: Teacher | null;
  onLogout: () => void;
  notifications: NotificationItem[];
  onClearNotifications: () => void;
  isConnected: boolean;
  settings: GeofenceSettings;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRequestPushNotifications?: () => void;
  pushStatus?: NotificationPermission | 'unsupported';
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  notifications,
  onClearNotifications,
  isConnected,
  settings,
  soundEnabled,
  onToggleSound,
  onRequestPushNotifications,
  pushStatus,
}) => {
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const todayStr = new Intl.DateTimeFormat('ar-JO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-slate-900 via-sky-950 to-blue-900 border-b border-sky-800/50 shadow-xl backdrop-blur-md">
      {/* Top UNRWA Official Header Ribbon */}
      <div className="bg-gradient-to-r from-sky-700 via-blue-600 to-cyan-600 px-4 py-2 text-white shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          {/* UNRWA identification */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-[10px] border border-white/40">
              UN
            </div>
            <span className="font-bold tracking-wide">وكالة الغوث الدولية</span>
            <span className="hidden md:inline text-sky-200">|</span>
            <span className="hidden md:inline text-sky-100">دائرة التربية والتعليم - الأردن</span>
            <span className="hidden lg:inline text-sky-200">|</span>
            <span className="hidden lg:inline bg-sky-900/60 px-2 py-0.5 rounded text-[11px] font-mono">
              رمز المدرسة: 10000596
            </span>
          </div>

          {/* School Name & Principal */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-bold text-amber-200">
              مدرسة ذكور مدينة اربد الاعدادية الثانية
            </span>
            <span className="hidden sm:inline text-sky-200">•</span>
            <span className="text-emerald-200 font-semibold bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
              مدير المدرسة: لؤي الخطيب
            </span>
          </div>
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Logo and System Title */}
        <div className="flex items-center gap-3.5 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-700 p-0.5 shadow-lg shadow-sky-500/20">
                <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-cyan-400">
                  <Shield className="w-6 h-6 text-cyan-400" />
                </div>
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-l from-white via-sky-100 to-cyan-300 bg-clip-text text-transparent">
                نظام تسجيل الحضور الالكتروني
              </h1>
              <p className="text-xs sm:text-sm text-sky-300/80 flex items-center gap-1.5 mt-0.5">
                <span>{todayStr}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="w-3 h-3 animate-pulse" />
                  <span>تخزين سحابي فوري</span>
                </span>
              </p>
            </div>
          </div>

          {/* Mobile Right Quick Controls */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-xl bg-slate-800/80 border border-sky-700/40 text-sky-200"
              title="الإشعارات"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right Section: Status, User Badge, Notifications */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-sky-500/10 border-sky-500/40 text-sky-300 hover:bg-sky-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
            title={soundEnabled ? 'صوت التنبيهات مفعّل' : 'صوت التنبيهات معطّل'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Download Project for GitHub Button */}
          <a
            href="/school-attendance-system.zip"
            download="school-attendance-system.zip"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-600/50 text-sky-200 text-xs font-bold transition shadow"
            title="تنزيل كامل ملفات المشروع كملف مضغوط ZIP لرفعه على GitHub"
          >
            <span className="font-mono text-cyan-400">GitHub</span>
            <span>تنزيل الملفات ⬇</span>
          </a>

          {/* Desktop Notification Bell */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-sky-700/40 text-sky-200 transition"
              title="سجل الإشعارات المباشرة"
            >
              <Bell className="w-5 h-5 text-sky-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[11px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifMenu && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-sky-600/50 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-sky-800/40 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-sm text-white">إشعارات الحضور الفورية</span>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={onClearNotifications}
                      className="text-[11px] text-sky-400 hover:text-sky-200 transition"
                    >
                      تحديد الكل كمقروء
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {notifications.length === 0 ? (
                    <p className="text-center py-6 text-xs text-slate-400">لا توجد إشعارات حالياً</p>
                  ) : (
                    notifications.slice(0, 15).map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-2.5 rounded-xl text-xs transition ${
                          notif.read
                            ? 'bg-slate-800/50 text-slate-300'
                            : 'bg-sky-950/80 border border-sky-500/30 text-white font-medium'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-cyan-300">{notif.teacherName}</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimeArabic(notif.time)}
                          </span>
                        </div>
                        <p className="text-slate-200 leading-relaxed">{notif.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile / Status */}
          {currentUser ? (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-sky-700/50 rounded-2xl p-1.5 sm:px-3 sm:py-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                <User className="w-4 h-4" />
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white flex items-center gap-1">
                  <span>{currentUser.name}</span>
                  {currentUser.role === 'principal' && (
                    <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] px-1.5 py-0.2 rounded-full font-semibold">
                      إدارة
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-sky-300/80">
                  الرقم: {currentUser.id} • {currentUser.specialty || currentUser.jobTitle}
                </div>
              </div>

              <button
                onClick={onLogout}
                className="mr-2 p-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 transition"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
