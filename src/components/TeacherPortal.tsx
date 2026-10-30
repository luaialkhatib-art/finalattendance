import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  MapPin,
  Calendar,
  FileText,
  Printer,
  KeyRound,
  ShieldAlert,
  Compass,
  ArrowRight,
  Send,
  HeartPulse,
  LogOut,
  CalendarDays,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AttendanceRecord, AttendanceStatus, GeofenceSettings, Teacher } from '../types.ts';
import { calculateDistanceMeters, getCurrentCoordinates, GeoPosition } from '../utils/geo.ts';
import { formatDateArabic, formatTimeArabic } from '../utils/export.ts';
import { sounds } from '../utils/audio.ts';

interface TeacherPortalProps {
  teacher: Teacher;
  todayRecord: AttendanceRecord | undefined;
  historyRecords: AttendanceRecord[];
  settings: GeofenceSettings;
  onRecordAttendance: (payload: {
    teacherId: string;
    status: AttendanceStatus;
    notes?: string;
    departureTime?: string;
    departureDuration?: string;
    latitude?: number;
    longitude?: number;
    customDate?: string;
    recordedBy: 'teacher';
  }) => Promise<{ success: boolean; error?: string; isOffline?: boolean; record?: AttendanceRecord }>;
  onChangePassword: (newPass: string) => Promise<{ success: boolean; error?: string }>;
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  teacher,
  todayRecord,
  historyRecords,
  settings,
  onRecordAttendance,
  onChangePassword,
}) => {
  // Tabs: 'attendance' | 'reports' | 'profile'
  const [activeTab, setActiveTab] = useState<'attendance' | 'reports' | 'profile'>('attendance');

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Form State
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('حاضر');
  const [notes, setNotes] = useState('');
  const [departureTime, setDepartureTime] = useState('11:00');
  const [departureDuration, setDepartureDuration] = useState('ساعة واحدة');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineSuccessMsg, setOfflineSuccessMsg] = useState<string | null>(null);

  // GPS state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [distanceToSchool, setDistanceToSchool] = useState<number | null>(null);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch GPS on mount
  useEffect(() => {
    checkLocation();
  }, [settings.latitude, settings.longitude, settings.enabled]);

  const checkLocation = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const pos = await getCurrentCoordinates();
      setUserLocation(pos);
      const dist = calculateDistanceMeters(
        settings.latitude,
        settings.longitude,
        pos.latitude,
        pos.longitude
      );
      setDistanceToSchool(dist);
    } catch (err: any) {
      setGpsError(err.message || 'تعذر تحديد الموقع الجغرافي');
    } finally {
      setGpsLoading(false);
    }
  };

  const isWithinGeofence =
    !settings.enabled || (distanceToSchool !== null && distanceToSchool <= settings.radiusMeters);

  const handleSubmitAttendance = async () => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // Check geofence (if not offline or if distance is known and outside)
    if (settings.enabled && !isWithinGeofence && !isOffline) {
      setSubmitError(
        `عذراً، لا يمكنك تسجيل الحضور لأنك خارج الموقع الجغرافي للمدرسة (${distanceToSchool || 0} م). النطاق المسموح به: ${settings.radiusMeters} م.`
      );
      return;
    }

    setSubmitError(null);
    setOfflineSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await onRecordAttendance({
        teacherId: teacher.id,
        status: selectedStatus,
        notes: notes.trim(),
        departureTime: selectedStatus === 'مغادرة' ? departureTime : undefined,
        departureDuration: selectedStatus === 'مغادرة' ? departureDuration : undefined,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
        customDate: selectedDate,
        recordedBy: 'teacher',
      });

      if (res.success) {
        sounds.playSuccessChime();
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#06b6d4', '#0284c7', '#10b981'],
        });

        if (res.isOffline) {
          setOfflineSuccessMsg(
            'تم حفظ تسجيلك بنجاح على ذاكرة هاتفك بدون اتصال بالإنترنت! سيتم إرساله ومزامنته مع إدارة المدرسة تلقائياً فور توفر النت.'
          );
        }
      } else {
        setSubmitError(res.error || 'حدث خطأ أثناء حفظ التسجيل');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'خطأ غير متوقع');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setPasswordMsg({ type: 'error', text: 'كلمة المرور يجب أن لا تقل عن 4 خانات' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'كلمتا المرور غير متطابقتين' });
      return;
    }

    const res = await onChangePassword(newPassword);
    if (res.success) {
      setPasswordMsg({ type: 'success', text: 'تم تغيير كلمة المرور بنجاح' });
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordMsg({ type: 'error', text: res.error || 'فشل التغيير' });
    }
  };

  // Stats calculation for the teacher
  const presentDaysCount = historyRecords.filter((r) => r.status === 'حاضر').length;
  const emergencyDaysCount = historyRecords.filter((r) => r.status === 'طارئة').length;
  const sickDaysCount = historyRecords.filter((r) => r.status === 'مرضية').length;
  const departuresCount = historyRecords.filter((r) => r.status === 'مغادرة').length;

  const remainingEmergency = Math.max(0, 7 - emergencyDaysCount);
  const remainingSick = Math.max(0, 14 - sickDaysCount);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Teacher Profile Banner */}
      <div className="bg-gradient-to-r from-sky-900/80 via-blue-900/70 to-slate-900 border border-sky-600/40 rounded-3xl p-6 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-semibold mb-2">
            <span>وكالة الغوث الدولية (الأردن)</span>
            <span>•</span>
            <span>مدرسة ذكور مدينة اربد الاعدادية الثانية</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            أهلاً وسهلاً، {teacher.name}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs sm:text-sm text-sky-200">
            <span className="font-semibold text-white">الرقم الوظيفي: {teacher.id}</span>
            <span>•</span>
            <span>التخصص: {teacher.specialty || teacher.jobTitle}</span>
            <span>•</span>
            <span>الهاتف: {teacher.phone}</span>
          </div>
        </div>

        {/* Quick Nav Tabs */}
        <div className="flex items-center gap-2 bg-slate-800/90 p-1.5 rounded-2xl border border-sky-700/40 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'attendance'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>تسجيل اليوم</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'reports'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>تقاريري وسجلاتي</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'profile'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>كلمة المرور</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ATTENDANCE CHECK-IN */}
      {activeTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Geolocation Guard Card */}
          <div className="lg:col-span-1 bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base text-white">التحقق الجغرافي للمدرسة</h3>
              </div>
              <button
                onClick={checkLocation}
                disabled={gpsLoading}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/60 px-2.5 py-1 rounded-lg border border-cyan-800"
              >
                <Compass className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
                <span>تحديث GPS</span>
              </button>
            </div>

            <div className="text-xs text-sky-200/80 leading-relaxed">
              الموقع المعتمد:{' '}
              <span className="font-bold text-white">{settings.schoolName}</span>
              <br />
              <span className="text-slate-400">({settings.locationLabel})</span>
            </div>

            {/* Geofence Status Badge */}
            {!settings.enabled ? (
              <div className="p-4 rounded-2xl bg-sky-950/60 border border-sky-500/40 text-sky-200 text-xs flex items-start gap-2.5">
                <CheckCircle className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sky-300">التحقق الجغرافي معطل مؤقتاً</div>
                  <div>قررت الإدارة السماح بالتسجيل بدون تقييد المسافة.</div>
                </div>
              </div>
            ) : gpsLoading ? (
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>جارٍ تحديد إحداثياتك والمسافة إلى المدرسة...</span>
              </div>
            ) : gpsError ? (
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-300">خدمة الموقع غير متاحة</div>
                  <div>{gpsError}</div>
                  <button
                    onClick={checkLocation}
                    className="mt-2 text-[11px] underline text-cyan-300 font-bold"
                  >
                    السماح للمتصفح بالموقع وإعادة المحاولة
                  </button>
                </div>
              </div>
            ) : isWithinGeofence ? (
              <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300">أنت ضمن النطاق الجغرافي للمدرسة</div>
                  <div>
                    المسافة الحالية: <span className="font-bold text-white">{distanceToSchool} متر</span>{' '}
                    (ضمن الحد المسموح به {settings.radiusMeters} متر).
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">أنت خارج نطاق المدرسة</div>
                  <div>
                    المسافة الحالية: <span className="font-bold text-white">{distanceToSchool} متر</span>.
                    الحد الأقصى المسموح به: {settings.radiusMeters} متر.
                  </div>
                  <div className="mt-1 text-[11px] text-amber-300/80">
                    يجب أن تكون متواجداً داخل حرم المدرسة (فوعرا) لتسجيل الحضور.
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
              <div>خط العرض: {userLocation?.latitude?.toFixed(5) || '---'}</div>
              <div>خط الطول: {userLocation?.longitude?.toFixed(5) || '---'}</div>
              <div>دقة الـ GPS: ±{Math.round(userLocation?.accuracy || 0)} متر</div>
            </div>
          </div>

          {/* Attendance Action Form */}
          <div className="lg:col-span-2 bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            {/* Date Selector Box */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-sky-600/40 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span>تاريخ التسجيل (من التقويم):</span>
                </label>

                {/* Date Context Badge */}
                {selectedDate < todayStr ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    🕒 تسجيل بأثر رجعي (تاريخ سابق)
                  </span>
                ) : selectedDate > todayStr ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    📅 تقديم طلب إجازة / مغادرة مسبقة (مستقبلي)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ✓ دوام اليوم الحالي
                  </span>
                )}
              </div>

              {settings.allowCustomDateForTeachers !== false ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="flex-1 bg-slate-900 border border-sky-600/50 rounded-xl px-3 py-2 text-white font-mono text-xs sm:text-sm outline-none focus:border-cyan-400"
                  />
                  {/* Quick Shortcut Buttons */}
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                      selectedDate === todayStr
                        ? 'bg-cyan-500 text-white shadow'
                        : 'bg-slate-700/80 text-slate-300 hover:text-white'
                    }`}
                  >
                    اليوم
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setSelectedDate(d.toISOString().split('T')[0]);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-700/80 text-slate-300 hover:text-white transition"
                  >
                    أمس
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      setSelectedDate(d.toISOString().split('T')[0]);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-700/80 text-slate-300 hover:text-white transition"
                  >
                    غداً
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/80 text-xs text-slate-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-cyan-300 font-bold">{selectedDate}</span>
                    <span>(التسجيل متاح لليوم الحالي فقط)</span>
                  </div>
                  <span className="text-[11px] text-amber-300/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    خاصية الأثر الرجعي معطلة من قِبل المدير
                  </span>
                </div>
              )}
            </div>

            {/* If record exists for the selected date */}
            {(() => {
              const recordForDate =
                historyRecords.find((r) => r.date === selectedDate) ||
                (selectedDate === todayStr ? todayRecord : undefined);

              if (!recordForDate) return null;

              return (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-sky-950/60 to-slate-900 border border-emerald-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs text-emerald-300 font-bold uppercase tracking-wider">
                        الحالة المسجلة لتاريخ ({formatDateArabic(selectedDate)}):
                      </div>
                      <div className="text-lg font-black text-white flex items-center gap-2 mt-0.5">
                        <span>الحالة: {recordForDate.status}</span>
                        <span className="text-xs font-normal text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
                          {formatTimeArabic(recordForDate.time)}
                        </span>
                      </div>
                      {recordForDate.notes && (
                        <div className="text-xs text-slate-300 mt-0.5">
                          ملاحظة: {recordForDate.notes}
                        </div>
                      )}
                      {recordForDate.isOfflineRecord && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-xs font-semibold mt-1">
                          <span>📶 سُجّل بدون إنترنت (محفوظ محلياً بانتظار المزامنة)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-cyan-300 bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800">
                    يمكنك تعديل الحالة أدناه
                  </div>
                </div>
              );
            })()}

            <div>
              <h3 className="text-lg font-black text-white mb-1">
                اختيار الحالة لتاريخ ({formatDateArabic(selectedDate)})
              </h3>
              <p className="text-xs sm:text-sm text-sky-200/80">
                اختر الحالة المناسبة (حاضر، طارئة، مرضية، مغادرة) لتثبيتها في السجلات الرسمية.
              </p>
            </div>

            {submitError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {offlineSuccessMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm flex items-start gap-2 shadow-lg animate-in fade-in">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300">تم الحفظ بنجاح دون اتصال!</div>
                  <div className="text-emerald-100/90 mt-0.5">{offlineSuccessMsg}</div>
                </div>
              </div>
            )}

            {/* 4 Status Choice Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Option 1: حاضر */}
              <button
                type="button"
                onClick={() => setSelectedStatus('حاضر')}
                className={`p-4 rounded-2xl border text-center transition-all ${
                  selectedStatus === 'حاضر'
                    ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 scale-[1.02]'
                    : 'bg-slate-800/70 border-slate-700/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm">حاضر</div>
                <div className="text-[11px] text-emerald-300/80 mt-1">دوام كامل معتاد</div>
              </button>

              {/* Option 2: طارئة */}
              <button
                type="button"
                onClick={() => setSelectedStatus('طارئة')}
                className={`p-4 rounded-2xl border text-center transition-all ${
                  selectedStatus === 'طارئة'
                    ? 'bg-amber-500/20 border-amber-400 text-white shadow-lg shadow-amber-500/20 scale-[1.02]'
                    : 'bg-slate-800/70 border-slate-700/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm">طارئة</div>
                <div className="text-[11px] text-amber-300/80 mt-1">إجازة عرضية طارئة</div>
              </button>

              {/* Option 3: مرضية */}
              <button
                type="button"
                onClick={() => setSelectedStatus('مرضية')}
                className={`p-4 rounded-2xl border text-center transition-all ${
                  selectedStatus === 'مرضية'
                    ? 'bg-rose-500/20 border-rose-400 text-white shadow-lg shadow-rose-500/20 scale-[1.02]'
                    : 'bg-slate-800/70 border-slate-700/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-2">
                  <HeartPulse className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm">مرضية</div>
                <div className="text-[11px] text-rose-300/80 mt-1">عذر / إجازة طبية</div>
              </button>

              {/* Option 4: مغادرة */}
              <button
                type="button"
                onClick={() => setSelectedStatus('مغادرة')}
                className={`p-4 rounded-2xl border text-center transition-all ${
                  selectedStatus === 'مغادرة'
                    ? 'bg-purple-500/20 border-purple-400 text-white shadow-lg shadow-purple-500/20 scale-[1.02]'
                    : 'bg-slate-800/70 border-slate-700/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-2">
                  <LogOut className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm">مغادرة</div>
                <div className="text-[11px] text-purple-300/80 mt-1">إذن مغادرة رسمي</div>
              </button>
            </div>

            {/* Extra details when 'مغادرة' is chosen */}
            {selectedStatus === 'مغادرة' && (
              <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-600/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-purple-200 mb-1">وقت المغادرة</label>
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full bg-slate-900 border border-purple-500/40 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-purple-200 mb-1">المدة المتوقعة</label>
                  <select
                    value={departureDuration}
                    onChange={(e) => setDepartureDuration(e.target.value)}
                    className="w-full bg-slate-900 border border-purple-500/40 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  >
                    <option value="ساعة واحدة">ساعة واحدة</option>
                    <option value="ساعتان">ساعتان</option>
                    <option value="ثلاث ساعات">ثلاث ساعات</option>
                    <option value="نهاية الدوام">حتى نهاية الدوام</option>
                  </select>
                </div>
              </div>
            )}

            {/* Optional Notes field */}
            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1.5">
                ملاحظات إضافية (السبب / تفاصيل الإجازة إن وجدت)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  selectedStatus === 'طارئة'
                    ? 'مثال: ظرف عائلي قاهر'
                    : selectedStatus === 'مرضية'
                    ? 'مثال: مراجعة المركز الصحي / عيادة الوكالة'
                    : selectedStatus === 'مغادرة'
                    ? 'مثال: مراجعة دائرة حكومية / أمر طارئ'
                    : 'اختياري...'
                }
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none focus:border-cyan-400"
              />
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleSubmitAttendance}
              disabled={submitting || (settings.enabled && !isWithinGeofence)}
              className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                settings.enabled && !isWithinGeofence
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-cyan-500 via-sky-600 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 active:scale-[0.99]'
              }`}
            >
              <Send className="w-5 h-5" />
              <span>
                {submitting
                  ? 'جارٍ حفظ التسجيل في السحابة وإشعار المدير...'
                  : todayRecord
                  ? `تحديث التسجيل إلى (${selectedStatus})`
                  : `تأكيد تسجيل الدوام (${selectedStatus})`}
              </span>
            </button>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
              <span>سيتم إرسال إشعار فوري لمدير المدرسة (الأستاذ لؤي الخطيب).</span>
              <span className="font-semibold text-emerald-400">سحابي ومحمي</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REPORTS & RECORDS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Summary KPI Cards for Teacher */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-sky-700/40 text-center">
              <div className="text-xs text-sky-300 font-bold mb-1">أيام الحضور الفعلي</div>
              <div className="text-3xl font-black text-white">{presentDaysCount}</div>
              <div className="text-[11px] text-emerald-400 mt-1">يوم دوام مسجل</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-sky-700/40 text-center">
              <div className="text-xs text-amber-300 font-bold mb-1">الإجازات الطارئة (العرضية)</div>
              <div className="text-3xl font-black text-amber-300">{emergencyDaysCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">المتبقي من الرصيد: {remainingEmergency} أيام</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-sky-700/40 text-center">
              <div className="text-xs text-rose-300 font-bold mb-1">الإجازات المرضية</div>
              <div className="text-3xl font-black text-rose-300">{sickDaysCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">المتبقي من الرصيد: {remainingSick} يوم</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-sky-700/40 text-center">
              <div className="text-xs text-purple-300 font-bold mb-1">المغادرات المرخصة</div>
              <div className="text-3xl font-black text-purple-300">{departuresCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">إذن مغادرة رسمي</div>
            </div>
          </div>

          {/* Detailed History Table */}
          <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-sky-800/40">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-cyan-400" />
                  <span>كشف دوام وسجل حضور المعلم</span>
                </h3>
                <p className="text-xs text-sky-200/70">
                  سجل تفصيلي بكافة الحركات والغيابات للموظف {teacher.name} (الرقم: {teacher.id})
                </p>
              </div>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-600/40 text-white text-xs font-bold transition shadow"
              >
                <Printer className="w-4 h-4 text-cyan-400" />
                <span>طباعة الكشف الرسمي</span>
              </button>
            </div>

            {/* Printable official slip header */}
            <div className="hidden print:block text-center border-b pb-4 mb-4 text-black">
              <h2 className="font-bold text-lg">وكالة الأمم المتحدة لإغاثة وتشغيل اللاجئين الفلسطينيين (UNRWA)</h2>
              <h3 className="text-md">دائرة التربية والتعليم - الأردن | رمز المدرسة: 10000596</h3>
              <h4 className="font-bold">مدرسة ذكور مدينة اربد الإعدادية الثانية</h4>
              <p className="mt-2 text-sm">
                كشف دوام المعلم: <strong>{teacher.name}</strong> - الرقم الوظيفي: <strong>{teacher.id}</strong> - التخصص: <strong>{teacher.specialty}</strong>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-800/60 text-sky-300 border-b border-sky-700/30">
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">اليوم</th>
                    <th className="p-3">وقت التسجيل</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">التفاصيل / الملاحظات</th>
                    <th className="p-3">الموقع الجغرافي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {historyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        لا توجد حركات مسجلة حالياً
                      </td>
                    </tr>
                  ) : (
                    historyRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3 font-mono">{rec.date}</td>
                        <td className="p-3">{formatDateArabic(rec.date).split('،')[0]}</td>
                        <td className="p-3 font-mono">{formatTimeArabic(rec.time)}</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              rec.status === 'حاضر'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : rec.status === 'طارئة'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : rec.status === 'مرضية'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300">
                          {rec.notes ||
                            (rec.departureTime ? `مغادرة الساعة ${rec.departureTime}` : '---')}
                        </td>
                        <td className="p-3">
                          {rec.location?.withinGeofence ? (
                            <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                              <MapPin className="w-3 h-3" />
                              <span>داخل المدرسة</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">تسجيل رسمي</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Signature Block for Print */}
            <div className="hidden print:flex justify-between items-center pt-10 text-black text-sm">
              <div className="text-center">
                <div>توقيع المعلم</div>
                <div className="mt-8 font-bold">{teacher.name}</div>
              </div>
              <div className="text-center">
                <div>مدير المدرسة</div>
                <div className="mt-8 font-bold">لؤي تيسير نمر الخطيب</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PASSWORD & PROFILE */}
      {activeTab === 'profile' && (
        <div className="max-w-xl mx-auto bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-cyan-400" />
              <span>تغيير كلمة المرور الخاصة بحسابك</span>
            </h3>
            <p className="text-xs text-sky-200/70 mt-1">
              كلمة المرور الافتراضية كانت 12345، يمكنك الآن تعيين كلمة مرور جديدة وسرية خاصة بك.
            </p>
          </div>

          {passwordMsg && (
            <div
              className={`p-3.5 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2 ${
                passwordMsg.type === 'success'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
              }`}
            >
              {passwordMsg.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
              <span>{passwordMsg.text}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة مرور جديدة"
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white text-sm outline-none focus:border-cyan-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور للتأكيد"
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white text-sm outline-none focus:border-cyan-400"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 transition"
            >
              حفظ كلمة المرور الجديدة
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1">
            <div>• اسم الموظف: {teacher.name}</div>
            <div>• الرقم الوظيفي: {teacher.id}</div>
            <div>• الهاتف: {teacher.phone}</div>
            <div>• المدرسة: مدرسة ذكور مدينة اربد الاعدادية الثانية (وكالة الغوث)</div>
          </div>
        </div>
      )}
    </div>
  );
};
