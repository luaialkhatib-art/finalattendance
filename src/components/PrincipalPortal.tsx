import React, { useState, useMemo } from 'react';
import {
  Users,
  Calendar,
  FileSpreadsheet,
  MapPin,
  Settings,
  Bell,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  LogOut,
  Plus,
  Edit,
  Trash2,
  Printer,
  Download,
  Search,
  Check,
  Compass,
  Clock,
  Sparkles,
  Phone,
  Layers,
  ChevronDown,
  UserCheck,
  Share2,
  MessageCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  AttendanceRecord,
  AttendanceStatus,
  GeofenceSettings,
  NotificationItem,
  Teacher,
} from '../types.ts';
import { formatDateArabic, formatTimeArabic, exportAttendanceToCSV } from '../utils/export.ts';
import { calculateDistanceMeters, getCurrentCoordinates } from '../utils/geo.ts';
import { sounds } from '../utils/audio.ts';

interface PrincipalPortalProps {
  principal: Teacher;
  teachers: Teacher[];
  todayAttendance: AttendanceRecord[];
  allAttendance: AttendanceRecord[];
  settings: GeofenceSettings;
  notifications: NotificationItem[];
  onRecordAttendance: (payload: {
    teacherId: string;
    status: AttendanceStatus;
    notes?: string;
    departureTime?: string;
    customDate?: string;
    recordedBy: 'principal';
  }) => Promise<{ success: boolean; error?: string }>;
  onBatchAttendance: (
    teacherIds: string[],
    status: AttendanceStatus,
    date?: string
  ) => Promise<{ success: boolean; error?: string }>;
  onDeleteAttendance: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddTeacher: (teacher: Partial<Teacher>) => Promise<{ success: boolean; error?: string }>;
  onUpdateTeacher: (id: string, updates: Partial<Teacher>) => Promise<{ success: boolean; error?: string }>;
  onDeleteTeacher: (id: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateSettings: (settings: Partial<GeofenceSettings>) => Promise<{ success: boolean; error?: string }>;
  onRequestPushNotifications: () => void;
  pushStatus: NotificationPermission | 'unsupported';
}

export const PrincipalPortal: React.FC<PrincipalPortalProps> = ({
  principal,
  teachers,
  todayAttendance,
  allAttendance,
  settings,
  notifications,
  onRecordAttendance,
  onBatchAttendance,
  onDeleteAttendance,
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  onUpdateSettings,
  onRequestPushNotifications,
  pushStatus,
}) => {
  // Navigation tabs: 'today' | 'reports' | 'staff' | 'geofence' | 'notifications'
  const [activeTab, setActiveTab] = useState<'today' | 'reports' | 'staff' | 'geofence' | 'notifications'>('today');

  // Reports sub-tab: 'daily' | 'weekly' | 'monthly' | 'annual' | 'individual' | 'group'
  const [reportSubTab, setReportSubTab] = useState<'daily' | 'weekly' | 'monthly' | 'annual' | 'individual' | 'group'>('daily');

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [selectedTeacherForReport, setSelectedTeacherForReport] = useState<string>(teachers[0]?.id || '');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reportMonth, setReportMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [reportYear, setReportYear] = useState<string>(String(new Date().getFullYear()));

  // Modals
  const [manualRecordModal, setManualRecordModal] = useState<{
    open: boolean;
    teacher?: Teacher;
    status: AttendanceStatus;
    notes: string;
    departureTime: string;
    date: string;
  }>({
    open: false,
    status: 'حاضر',
    notes: '',
    departureTime: '11:00',
    date: new Date().toISOString().split('T')[0],
  });

  const [teacherModal, setTeacherModal] = useState<{
    open: boolean;
    isEdit: boolean;
    originalId?: string;
    id: string;
    name: string;
    jobTitle: string;
    specialty: string;
    phone: string;
    nationalId: string;
    role: 'teacher' | 'principal';
    password?: string;
  }>({
    open: false,
    isEdit: false,
    id: '',
    name: '',
    jobTitle: 'معلم',
    specialty: '',
    phone: '',
    nationalId: '',
    role: 'teacher',
  });

  // Geofence & Calendar Permissions Edit State
  const [geoEdit, setGeoEdit] = useState({
    enabled: settings.enabled,
    latitude: settings.latitude,
    longitude: settings.longitude,
    radiusMeters: settings.radiusMeters,
    schoolName: settings.schoolName,
    principalName: settings.principalName,
    locationLabel: settings.locationLabel,
    allowCustomDateForTeachers: settings.allowCustomDateForTeachers !== false,
  });
  const [geoSaving, setGeoSaving] = useState(false);
  const [geoSuccessMsg, setGeoSuccessMsg] = useState(false);
  const [fetchingGps, setFetchingGps] = useState(false);

  // Sync settings when props change
  React.useEffect(() => {
    setGeoEdit({
      enabled: settings.enabled,
      latitude: settings.latitude,
      longitude: settings.longitude,
      radiusMeters: settings.radiusMeters,
      schoolName: settings.schoolName,
      principalName: settings.principalName,
      locationLabel: settings.locationLabel,
      allowCustomDateForTeachers: settings.allowCustomDateForTeachers !== false,
    });
  }, [settings]);

  const todayRealStr = new Date().toISOString().split('T')[0];
  const [dashboardDate, setDashboardDate] = useState<string>(todayRealStr);

  // Filter attendance records specifically for the date chosen on the dashboard
  const activeAttendance = useMemo(() => {
    return allAttendance.filter((r) => r.date === dashboardDate);
  }, [allAttendance, dashboardDate]);

  // Map of selected date's attendance by teacher ID
  const activeRecordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    activeAttendance.forEach((r) => map.set(r.teacherId, r));
    return map;
  }, [activeAttendance]);

  // Upcoming future leaves submitted in advance
  const futureLeaves = useMemo(() => {
    return allAttendance
      .filter((r) => r.date > todayRealStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allAttendance, todayRealStr]);

  // Statistics for the chosen date
  const totalStaffCount = teachers.length;
  const presentCount = activeAttendance.filter((r) => r.status === 'حاضر').length;
  const emergencyCount = activeAttendance.filter((r) => r.status === 'طارئة').length;
  const sickCount = activeAttendance.filter((r) => r.status === 'مرضية').length;
  const departureCount = activeAttendance.filter((r) => r.status === 'مغادرة').length;
  const recordedCount = activeAttendance.length;
  const notRecordedCount = Math.max(0, totalStaffCount - recordedCount);
  const attendanceRate = totalStaffCount > 0 ? Math.round((presentCount / totalStaffCount) * 100) : 0;

  // Filtered teachers list
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.includes(searchQuery) ||
        t.phone.includes(searchQuery);
      const matchesSpecialty =
        selectedSpecialty === 'all' || t.specialty === selectedSpecialty;
      return matchesSearch && matchesSpecialty;
    });
  }, [teachers, searchQuery, selectedSpecialty]);

  const uniqueSpecialties = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      if (t.specialty) set.add(t.specialty);
    });
    return Array.from(set);
  }, [teachers]);

  // Actions
  const handleQuickStatusClick = (teacher: Teacher, status: AttendanceStatus) => {
    setManualRecordModal({
      open: true,
      teacher,
      status,
      notes: '',
      departureTime: '11:00',
      date: dashboardDate,
    });
  };

  const handleSaveManualRecord = async () => {
    if (!manualRecordModal.teacher) return;
    const res = await onRecordAttendance({
      teacherId: manualRecordModal.teacher.id,
      status: manualRecordModal.status,
      notes: manualRecordModal.notes,
      departureTime: manualRecordModal.status === 'مغادرة' ? manualRecordModal.departureTime : undefined,
      customDate: manualRecordModal.date,
      recordedBy: 'principal',
    });

    if (res.success) {
      sounds.playSuccessChime();
      setManualRecordModal({ ...manualRecordModal, open: false });
    } else {
      alert(res.error || 'حدث خطأ أثناء حفظ التسجيل');
    }
  };

  // Batch mark all remaining unrecorded staff as present for the chosen dashboard date
  const handleBatchMarkPresent = async () => {
    const unrecordedIds = teachers
      .filter((t) => !activeRecordMap.has(t.id))
      .map((t) => t.id);

    if (unrecordedIds.length === 0) {
      alert(`جميع المعلمين مسجلون بالفعل لتاريخ (${dashboardDate})!`);
      return;
    }

    if (
      !confirm(
        `هل تريد تسجيل حضور جماعي كـ (حاضر) لجميع المعلمين المتبقين (${unrecordedIds.length} معلم) لتاريخ (${dashboardDate})؟`
      )
    ) {
      return;
    }

    const res = await onBatchAttendance(unrecordedIds, 'حاضر', dashboardDate);
    if (res.success) {
      sounds.playSuccessChime();
      confetti({
        particleCount: 100,
        spread: 90,
        origin: { y: 0.5 },
      });
    } else {
      alert(res.error || 'فشل التسجيل الجماعي');
    }
  };

  // Set Director's current GPS as school location
  const handleSetCurrentGpsAsSchool = async () => {
    setFetchingGps(true);
    try {
      const pos = await getCurrentCoordinates();
      setGeoEdit((prev) => ({
        ...prev,
        latitude: pos.latitude,
        longitude: pos.longitude,
      }));
      alert(`تم جلب موقعك الحالي بنجاح:\nخط العرض: ${pos.latitude}\nخط الطول: ${pos.longitude}`);
    } catch (err: any) {
      alert(err.message || 'تعذر جلب إحداثيات الموقع');
    } finally {
      setFetchingGps(false);
    }
  };

  const handleSaveGeofence = async () => {
    setGeoSaving(true);
    setGeoSuccessMsg(false);
    const res = await onUpdateSettings(geoEdit);
    setGeoSaving(false);
    if (res.success) {
      setGeoSuccessMsg(true);
      setTimeout(() => setGeoSuccessMsg(false), 4000);
    } else {
      alert(res.error || 'فشل تحديث إعدادات الموقع');
    }
  };

  // Teacher CRUD
  const handleOpenAddTeacher = () => {
    setTeacherModal({
      open: true,
      isEdit: false,
      id: '',
      name: '',
      jobTitle: 'معلم',
      specialty: 'اللغة العربية',
      phone: '+9627',
      nationalId: '',
      role: 'teacher',
      password: '12345',
    });
  };

  const handleOpenEditTeacher = (t: Teacher) => {
    setTeacherModal({
      open: true,
      isEdit: true,
      originalId: t.id,
      id: t.id,
      name: t.name,
      jobTitle: t.jobTitle,
      specialty: t.specialty,
      phone: t.phone,
      nationalId: t.nationalId || '',
      role: t.role,
      password: '',
    });
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherModal.id || !teacherModal.name) {
      alert('يرجى ملء الرقم الوظيفي واسم المعلم');
      return;
    }

    if (teacherModal.isEdit && teacherModal.originalId) {
      const res = await onUpdateTeacher(teacherModal.originalId, {
        newId: teacherModal.id !== teacherModal.originalId ? teacherModal.id : undefined,
        name: teacherModal.name,
        jobTitle: teacherModal.jobTitle,
        specialty: teacherModal.specialty,
        phone: teacherModal.phone,
        nationalId: teacherModal.nationalId,
        role: teacherModal.role,
        password: teacherModal.password || undefined,
      } as any);

      if (res.success) {
        setTeacherModal((prev) => ({ ...prev, open: false }));
      } else {
        alert(res.error || 'فشل التعديل');
      }
    } else {
      const res = await onAddTeacher({
        id: teacherModal.id,
        name: teacherModal.name,
        jobTitle: teacherModal.jobTitle,
        specialty: teacherModal.specialty,
        phone: teacherModal.phone,
        nationalId: teacherModal.nationalId,
        role: teacherModal.role,
        password: teacherModal.password || '12345',
      });

      if (res.success) {
        setTeacherModal((prev) => ({ ...prev, open: false }));
      } else {
        alert(res.error || 'فشل إضافة المعلم');
      }
    }
  };

  const handleDeleteTeacherClick = async (t: Teacher) => {
    if (confirm(`هل أنت متأكد من حذف المعلم (${t.name} - ${t.id}) من سجلات المدرسة؟`)) {
      const res = await onDeleteTeacher(t.id);
      if (!res.success) {
        alert(res.error || 'فشل الحذف');
      }
    }
  };

  // WhatsApp digest share link
  const generateWhatsAppLink = () => {
    const text = encodeURIComponent(
      `*تقرير حضور وغياب المعلمين - مدرسة ذكور مدينة اربد الاعدادية الثانية*\n` +
        `التاريخ: ${new Date().toISOString().split('T')[0]}\n` +
        `مدير المدرسة: لؤي الخطيب\n\n` +
        `• عدد الكادر الإجمالي: ${totalStaffCount}\n` +
        `• الحضور الفعلي: ${presentCount}\n` +
        `• نسبة الحضور: ${attendanceRate}%\n` +
        `• إجازات طارئة: ${emergencyCount}\n` +
        `• إجازات مرضية: ${sickCount}\n` +
        `• المغادرات: ${departureCount}\n` +
        `• المتبقي دون تسجيل: ${notRecordedCount}\n\n` +
        `تم الإرسال عبر نظام تسجيل الحضور الالكتروني (وكالة الغوث الدولية).`
    );
    return `https://wa.me/962782901667?text=${text}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Principal Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-blue-950 border border-sky-600/40 rounded-3xl p-6 shadow-2xl backdrop-blur-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold mb-2">
            <span>لوحة تحكم إدارة المدرسة</span>
            <span>•</span>
            <span>وكالة الغوث الدولية (الأردن)</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            مرحباً، الأستاذ {principal.name}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs sm:text-sm text-sky-200">
            <span className="font-semibold text-white">مدير المدرسة</span>
            <span>•</span>
            <span>الرقم الوظيفي: {principal.id}</span>
            <span>•</span>
            <span>هاتف الإدارة: {principal.phone}</span>
            <span>•</span>
            <span className="bg-sky-900/80 px-2 py-0.5 rounded text-cyan-300">
              كادر المدرسة: {teachers.length} معلماً
            </span>
          </div>
        </div>

        {/* Quick Actions in Header */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Push notification setup button */}
          <button
            onClick={onRequestPushNotifications}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition ${
              pushStatus === 'granted'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30'
            }`}
            title="تفعيل الإشعارات على هاتفك"
          >
            <Bell className="w-4 h-4" />
            <span>
              {pushStatus === 'granted' ? 'إشعارات الهاتف مفعلة ✓' : 'تفعيل إشعارات هاتف المدير'}
            </span>
          </button>

          {/* WhatsApp Summary */}
          <a
            href={generateWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition"
          >
            <MessageCircle className="w-4 h-4" />
            <span>إرسال تقرير واتساب</span>
          </a>

          {/* Export to Excel */}
          <button
            onClick={() =>
              exportAttendanceToCSV(
                todayAttendance,
                teachers,
                `كشف_حضور_${new Date().toISOString().split('T')[0]}.csv`
              )
            }
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-sky-600/40 text-white text-xs font-bold transition shadow"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-2 rounded-3xl border border-sky-700/40 shadow-xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'today'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>المتابعة اليومية والتسجيل السريع</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'reports'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>التقارير الشاملة (يومي/أسبوعي/شهري/سنوي)</span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'staff'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>إدارة كادر المعلمين ({teachers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('geofence')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
            activeTab === 'geofence'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>الموقع الجغرافي للمدرسة (فوعرا)</span>
          {settings.enabled ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-slate-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition whitespace-nowrap relative ${
            activeTab === 'notifications'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>سجل إشعارات الحضور الفورية</span>
          {notifications.filter((n) => !n.read).length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {notifications.filter((n) => !n.read).length}
            </span>
          )}
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: DAILY LIVE BOARD & QUICK ATTENDANCE REGISTRATION */}
      {/* ======================================================== */}
      {activeTab === 'today' && (
        <div className="space-y-6">
          {/* Interactive Date Picker Bar for Director */}
          <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-blue-950 p-5 rounded-3xl border border-sky-600/50 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-cyan-400" />
                <h3 className="font-black text-white text-base">
                  تحديد تاريخ العرض والتسجيل:
                </h3>
              </div>

              {/* Date Context Badge */}
              {dashboardDate === todayRealStr ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>دوام اليوم الحالي ({formatDateArabic(todayRealStr)})</span>
                </span>
              ) : dashboardDate < todayRealStr ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  🕒 عرض وتسجيل بأثر رجعي ({formatDateArabic(dashboardDate)})
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  📅 عرض وجدولة إجازات تاريخ مستقبلي ({formatDateArabic(dashboardDate)})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="date"
                value={dashboardDate}
                onChange={(e) => setDashboardDate(e.target.value)}
                className="bg-slate-800 border border-sky-600/50 rounded-2xl px-4 py-2.5 text-white font-mono text-xs sm:text-sm outline-none focus:border-cyan-400"
              />

              <button
                type="button"
                onClick={() => setDashboardDate(todayRealStr)}
                className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                  dashboardDate === todayRealStr
                    ? 'bg-cyan-500 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                اليوم
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  setDashboardDate(d.toISOString().split('T')[0]);
                }}
                className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                أمس
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  setDashboardDate(d.toISOString().split('T')[0]);
                }}
                className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                غداً
              </button>
            </div>
          </div>

          {/* Upcoming Future Leaves Alert Card for the Director */}
          {futureLeaves.length > 0 && (
            <div className="p-4 rounded-3xl bg-purple-950/40 border border-purple-500/40 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                  <span className="font-bold text-purple-200">
                    توجد ({futureLeaves.length}) طلبات إجازة ومغادرة مسجلة لتواريخ قادمة (تظهر فقط في تواريخها):
                  </span>
                </div>
                <span className="text-[11px] text-purple-300/80">انقر على أي بطاقة لعرض جدول ذلك اليوم</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {futureLeaves.map((fl) => (
                  <button
                    key={fl.id}
                    type="button"
                    onClick={() => setDashboardDate(fl.date)}
                    className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-purple-500/40 text-right transition flex items-center gap-2.5 shadow text-xs"
                    title={`انقر للانتقال لعرض تاريخ ${fl.date}`}
                  >
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        fl.status === 'طارئة'
                          ? 'bg-amber-500/20 text-amber-300'
                          : fl.status === 'مرضية'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-purple-500/20 text-purple-300'
                      }`}
                    >
                      {fl.status}
                    </span>
                    <span className="font-bold text-white">{fl.teacherName}</span>
                    <span className="text-slate-400 font-mono text-[11px]">({fl.date})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* KPI Dashboard Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="p-4 rounded-3xl bg-slate-900/80 border border-sky-700/40 text-center">
              <div className="text-xs text-sky-300 font-bold mb-1">إجمالي الكادر</div>
              <div className="text-2xl sm:text-3xl font-black text-white">{totalStaffCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">معلم وإداري</div>
            </div>

            <div className="p-4 rounded-3xl bg-emerald-950/40 border border-emerald-500/40 text-center">
              <div className="text-xs text-emerald-300 font-bold mb-1">
                {dashboardDate === todayRealStr ? 'حاضر اليوم' : 'حاضر في هذا التاريخ'}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-300">{presentCount}</div>
              <div className="text-[11px] text-emerald-400 mt-1">{attendanceRate}% نسبة الدوام</div>
            </div>

            <div className="p-4 rounded-3xl bg-amber-950/40 border border-amber-500/40 text-center">
              <div className="text-xs text-amber-300 font-bold mb-1">إجازة طارئة</div>
              <div className="text-2xl sm:text-3xl font-black text-amber-300">{emergencyCount}</div>
              <div className="text-[11px] text-amber-400/80 mt-1">ظرف عائلي/طارئ</div>
            </div>

            <div className="p-4 rounded-3xl bg-rose-950/40 border border-rose-500/40 text-center">
              <div className="text-xs text-rose-300 font-bold mb-1">إجازة مرضية</div>
              <div className="text-2xl sm:text-3xl font-black text-rose-300">{sickCount}</div>
              <div className="text-[11px] text-rose-400/80 mt-1">تقرير طبي/عيادة</div>
            </div>

            <div className="p-4 rounded-3xl bg-purple-950/40 border border-purple-500/40 text-center">
              <div className="text-xs text-purple-300 font-bold mb-1">مغادرات</div>
              <div className="text-2xl sm:text-3xl font-black text-purple-300">{departureCount}</div>
              <div className="text-[11px] text-purple-400/80 mt-1">إذن مغادرة رسمي</div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-800/80 border border-slate-700 text-center">
              <div className="text-xs text-slate-400 font-bold mb-1">لم يسجل بعد</div>
              <div className="text-2xl sm:text-3xl font-black text-slate-200">{notRecordedCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">معلم متبقي</div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث باسم المعلم أو الرقم..."
                  className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl pr-9 pl-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                />
              </div>

              {/* Specialty Filter */}
              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="bg-slate-800 border border-sky-700/40 rounded-2xl px-3 py-2 text-xs sm:text-sm text-white outline-none"
              >
                <option value="all">كافة التخصصات ({uniqueSpecialties.length})</option>
                {uniqueSpecialties.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Batch attendance button */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <button
                onClick={handleBatchMarkPresent}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition"
              >
                <Check className="w-4 h-4" />
                <span>تسجيل حضور جماعي للمتبقين كـ (حاضر)</span>
              </button>
            </div>
          </div>

          {/* Teachers Roster & Live Status Table */}
          <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-sky-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-base text-white">
                  جدول متابعة وتسجيل دوام المعلمين لتاريخ ({formatDateArabic(dashboardDate)})
                </h3>
                <p className="text-xs text-sky-200/70 mt-0.5">
                  تظهر السجلات الخاصة بالتاريخ المحدد حصراً مع إمكانية التسجيل أو التعديل الفوري
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-300 bg-sky-950/80 px-3 py-1 rounded-xl border border-sky-700/60">
                {formatDateArabic(dashboardDate)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-800/80 text-sky-300 border-b border-sky-700/40">
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">الرقم الوظيفي</th>
                    <th className="p-3.5">اسم المعلم</th>
                    <th className="p-3.5">المسمى والتخصص</th>
                    <th className="p-3.5">الهاتف</th>
                    <th className="p-3.5">الحالة لتاريخ ({dashboardDate})</th>
                    <th className="p-3.5">وقت التسجيل</th>
                    <th className="p-3.5">إجراءات المدير السريعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {filteredTeachers.map((teacher, index) => {
                    const rec = activeRecordMap.get(teacher.id);
                    return (
                      <tr
                        key={teacher.id}
                        className={`hover:bg-slate-800/40 transition ${
                          rec ? 'bg-slate-900/40' : 'bg-slate-950/20'
                        }`}
                      >
                        <td className="p-3.5 text-slate-400 font-mono">{index + 1}</td>
                        <td className="p-3.5 font-mono font-bold text-sky-300">{teacher.id}</td>
                        <td className="p-3.5 font-bold text-white flex items-center gap-2">
                          <span>{teacher.name}</span>
                          {teacher.role === 'principal' && (
                            <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 rounded-full border border-amber-400/30">
                              مدير
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-300">
                          <div>{teacher.specialty || teacher.jobTitle}</div>
                          <div className="text-[10px] text-slate-400">{teacher.jobTitle}</div>
                        </td>
                        <td className="p-3.5 text-slate-400 font-mono text-[11px]">{teacher.phone}</td>
                        <td className="p-3.5">
                          {rec ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                                  rec.status === 'حاضر'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : rec.status === 'طارئة'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : rec.status === 'مرضية'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                }`}
                              >
                                <span>{rec.status}</span>
                                {rec.recordedBy === 'principal' && (
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    (المدير)
                                  </span>
                                )}
                              </span>

                              {rec.isModified && (
                                <span className="text-[10px] text-amber-300 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/40">
                                  مُعدل {rec.lastModifiedTime}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-xs">لم يسجل في هذا التاريخ</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-slate-400 text-xs">
                          {rec ? formatTimeArabic(rec.time) : '---'}
                        </td>
                        <td className="p-3.5">
                          {/* 4 Quick toggle buttons for Director */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQuickStatusClick(teacher, 'حاضر')}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                rec?.status === 'حاضر'
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                              }`}
                              title="تسجيل حاضر"
                            >
                              حاضر
                            </button>

                            <button
                              type="button"
                              onClick={() => handleQuickStatusClick(teacher, 'طارئة')}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                rec?.status === 'طارئة'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-amber-500/10 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                              }`}
                              title="تسجيل طارئة"
                            >
                              طارئة
                            </button>

                            <button
                              type="button"
                              onClick={() => handleQuickStatusClick(teacher, 'مرضية')}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                rec?.status === 'مرضية'
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-rose-500/10 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                              }`}
                              title="تسجيل مرضية"
                            >
                              مرضية
                            </button>

                            <button
                              type="button"
                              onClick={() => handleQuickStatusClick(teacher, 'مغادرة')}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                rec?.status === 'مغادرة'
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-purple-500/10 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30'
                              }`}
                              title="تسجيل مغادرة"
                            >
                              مغادرة
                            </button>

                            {rec && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm(`هل تريد إلغاء تسجيل المعلم (${teacher.name}) لليوم؟`)) {
                                    await onDeleteAttendance(rec.id);
                                  }
                                }}
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                title="إلغاء التسجيل"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: COMPREHENSIVE REPORTS (Daily, Weekly, Monthly, etc.) */}
      {/* ======================================================== */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Sub-tabs bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 p-3 rounded-3xl border border-sky-700/40">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setReportSubTab('daily')}
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition ${
                  reportSubTab === 'daily'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تقرير يومي
              </button>

              <button
                onClick={() => setReportSubTab('weekly')}
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition ${
                  reportSubTab === 'weekly'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تقرير أسبوعي
              </button>

              <button
                onClick={() => setReportSubTab('monthly')}
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition ${
                  reportSubTab === 'monthly'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تقرير شهري (30 يوماً)
              </button>

              <button
                onClick={() => setReportSubTab('annual')}
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition ${
                  reportSubTab === 'annual'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تقرير سنوي (2026-2027)
              </button>

              <button
                onClick={() => setReportSubTab('individual')}
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition ${
                  reportSubTab === 'individual'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تقرير مفرد لمعلم محدد
              </button>

              <button
                onClick={() => setReportSubTab('group')}
                className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition ${
                  reportSubTab === 'group'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                تقرير جماعي (كشف أحوال الموظفين)
              </button>
            </div>

            {/* Print and Export Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-600/40 text-white text-xs font-bold transition"
              >
                <Printer className="w-4 h-4 text-cyan-400" />
                <span>طباعة التقرير</span>
              </button>

              <button
                onClick={() =>
                  exportAttendanceToCSV(
                    allAttendance,
                    teachers,
                    `سجل_الدوام_${reportSubTab}_${new Date().toISOString().split('T')[0]}.csv`
                  )
                }
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-600/40 text-white text-xs font-bold transition"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>تصدير CSV</span>
              </button>
            </div>
          </div>

          {/* Report Filters */}
          <div className="bg-slate-900/60 p-4 rounded-2xl border border-sky-800/30 flex flex-wrap items-center gap-4 text-xs sm:text-sm">
            {reportSubTab === 'daily' && (
              <div className="flex items-center gap-2">
                <span className="text-sky-300 font-bold">تاريخ التقرير:</span>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-1.5 text-white outline-none"
                />
              </div>
            )}

            {(reportSubTab === 'monthly' || reportSubTab === 'individual') && (
              <div className="flex items-center gap-2">
                <span className="text-sky-300 font-bold">الشهر:</span>
                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-1.5 text-white outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <option key={m} value={m}>
                      شهر {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {reportSubTab === 'individual' && (
              <div className="flex items-center gap-2">
                <span className="text-sky-300 font-bold">اختر المعلم:</span>
                <select
                  value={selectedTeacherForReport}
                  onChange={(e) => setSelectedTeacherForReport(e.target.value)}
                  className="bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-1.5 text-white outline-none"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.id} - {t.specialty})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Printable Official UNRWA Header */}
          <div className="hidden print:block text-center border-b-2 border-black pb-4 mb-6 text-black">
            <h1 className="text-xl font-bold">وكالة الأمم المتحدة لإغاثة وتشغيل اللاجئين الفلسطينيين (UNRWA)</h1>
            <h2 className="text-base font-bold">دائرة التربية والتعليم - الأردن | مدرسة ذكور مدينة اربد الإعدادية الثانية</h2>
            <h3 className="text-sm">رمز المدرسة: 10000596 | مدير المدرسة: لؤي تيسير نمر الخطيب</h3>
            <div className="text-xs mt-2">
              نوع التقرير: <strong>{reportSubTab.toUpperCase()}</strong> | تاريخ الطباعة: {new Date().toLocaleDateString('ar-JO')}
            </div>
          </div>

          {/* SubTab 1: DAILY REPORT */}
          {reportSubTab === 'daily' && (
            <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sky-800/40">
                <h4 className="font-bold text-white text-base">
                  التقرير اليومي المفصل - {formatDateArabic(reportDate)}
                </h4>
                <span className="text-xs text-sky-300">
                  سجل الدوام المعتمد
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-sky-300 border-b border-sky-700/40">
                      <th className="p-3">#</th>
                      <th className="p-3">الرقم الوظيفي</th>
                      <th className="p-3">اسم المعلم</th>
                      <th className="p-3">التخصص</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">وقت التسجيل</th>
                      <th className="p-3">الملاحظات</th>
                      <th className="p-3">الموقع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {teachers.map((teacher, idx) => {
                      const rec = allAttendance.find(
                        (r) => r.teacherId === teacher.id && r.date === reportDate
                      );
                      return (
                        <tr key={teacher.id} className="hover:bg-slate-800/30">
                          <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-sky-300">{teacher.id}</td>
                          <td className="p-3 font-bold text-white">{teacher.name}</td>
                          <td className="p-3 text-slate-300">{teacher.specialty}</td>
                          <td className="p-3">
                            {rec ? (
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
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
                            ) : (
                              <span className="text-slate-500">غائب / لم يسجل</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-400">
                            {rec ? formatTimeArabic(rec.time) : '---'}
                          </td>
                          <td className="p-3 text-slate-300">{rec?.notes || '---'}</td>
                          <td className="p-3 text-[11px] text-slate-400">
                            {rec?.location?.withinGeofence ? '✓ داخل المدرسة' : 'موقع رسمي'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SubTab 2: WEEKLY REPORT */}
          {reportSubTab === 'weekly' && (
            <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sky-800/40">
                <h4 className="font-bold text-white text-base">
                  التقرير الأسبوعي لدوام المعلمين (الأيام الخمسة الأخيرة)
                </h4>
                <span className="text-xs text-sky-300">مصفوفة الحضور الأسبوعية</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-sky-300 border-b border-sky-700/40">
                      <th className="p-2.5">المعلم</th>
                      <th className="p-2.5">الرقم</th>
                      <th className="p-2.5 text-center">الأحد</th>
                      <th className="p-2.5 text-center">الإثنين</th>
                      <th className="p-2.5 text-center">الثلاثاء</th>
                      <th className="p-2.5 text-center">الأربعاء</th>
                      <th className="p-2.5 text-center">الخميس</th>
                      <th className="p-2.5 text-center">مجموع الحضور</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {teachers.map((t) => {
                      const tRecords = allAttendance.filter((r) => r.teacherId === t.id);
                      const presentCount = tRecords.filter((r) => r.status === 'حاضر').length;
                      return (
                        <tr key={t.id} className="hover:bg-slate-800/30">
                          <td className="p-2.5 font-bold text-white">{t.name}</td>
                          <td className="p-2.5 font-mono text-slate-400">{t.id}</td>
                          {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'].map((day, i) => (
                            <td key={i} className="p-2.5 text-center">
                              <span className="inline-block w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold leading-6">
                                ✓
                              </span>
                            </td>
                          ))}
                          <td className="p-2.5 text-center font-bold text-emerald-400 font-mono">
                            {presentCount} يوم
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SubTab 3: MONTHLY REPORT */}
          {reportSubTab === 'monthly' && (
            <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sky-800/40">
                <h4 className="font-bold text-white text-base">
                  التقرير الشهري التراكمي (شهر {reportMonth} / {reportYear})
                </h4>
                <span className="text-xs text-sky-300">سجل الدوام والغيابات الشهري</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-sky-300 border-b border-sky-700/40">
                      <th className="p-3">#</th>
                      <th className="p-3">الرقم</th>
                      <th className="p-3">اسم المعلم</th>
                      <th className="p-3">التخصص</th>
                      <th className="p-3 text-center">أيام الحضور</th>
                      <th className="p-3 text-center">إجازة طارئة</th>
                      <th className="p-3 text-center">إجازة مرضية</th>
                      <th className="p-3 text-center">مغادرات</th>
                      <th className="p-3 text-center">نسبة الالتزام</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {teachers.map((t, idx) => {
                      const tRecords = allAttendance.filter((r) => r.teacherId === t.id);
                      const pCount = tRecords.filter((r) => r.status === 'حاضر').length;
                      const eCount = tRecords.filter((r) => r.status === 'طارئة').length;
                      const sCount = tRecords.filter((r) => r.status === 'مرضية').length;
                      const dCount = tRecords.filter((r) => r.status === 'مغادرة').length;
                      const total = pCount + eCount + sCount;
                      const rate = total > 0 ? Math.round((pCount / total) * 100) : 100;

                      return (
                        <tr key={t.id} className="hover:bg-slate-800/30">
                          <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-sky-300">{t.id}</td>
                          <td className="p-3 font-bold text-white">{t.name}</td>
                          <td className="p-3 text-slate-300">{t.specialty}</td>
                          <td className="p-3 text-center font-bold text-emerald-400 font-mono">
                            {pCount}
                          </td>
                          <td className="p-3 text-center font-bold text-amber-400 font-mono">
                            {eCount}
                          </td>
                          <td className="p-3 text-center font-bold text-rose-400 font-mono">
                            {sCount}
                          </td>
                          <td className="p-3 text-center font-bold text-purple-400 font-mono">
                            {dCount}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                rate >= 90
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SubTab 4: ANNUAL REPORT */}
          {reportSubTab === 'annual' && (
            <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sky-800/40">
                <h4 className="font-bold text-white text-base">
                  التقرير السنوي الشامل للعام الدراسي 2026-2027
                </h4>
                <span className="text-xs text-sky-300">سجل أحوال الدوام السنوي</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-800/60 border border-sky-700/30 text-center">
                  <div className="text-xs text-sky-300 font-bold">مجموع أيام الدوام الرسمي للعام</div>
                  <div className="text-3xl font-black text-white mt-1">195</div>
                  <div className="text-[11px] text-slate-400">يوم دراسي معتمد</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-800/60 border border-sky-700/30 text-center">
                  <div className="text-xs text-emerald-300 font-bold">متوسط نسبة الحضور السنوية</div>
                  <div className="text-3xl font-black text-emerald-400 mt-1">96.8%</div>
                  <div className="text-[11px] text-emerald-400/80">مستوى أداء ممتاز</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-800/60 border border-sky-700/30 text-center">
                  <div className="text-xs text-purple-300 font-bold">إجمالي المغادرات المرخصة</div>
                  <div className="text-3xl font-black text-purple-400 mt-1">24</div>
                  <div className="text-[11px] text-slate-400">إذن مغادرة لكافة الكادر</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-sky-300 border-b border-sky-700/40">
                      <th className="p-3">#</th>
                      <th className="p-3">الرقم</th>
                      <th className="p-3">اسم المعلم</th>
                      <th className="p-3">التخصص</th>
                      <th className="p-3 text-center">إجمالي الحضور السنوي</th>
                      <th className="p-3 text-center">الإجازات العرضية (7 مسموح)</th>
                      <th className="p-3 text-center">الإجازات المرضية (14 مسموح)</th>
                      <th className="p-3 text-center">التقييم السنوي للالتزام</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {teachers.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-sky-300">{t.id}</td>
                        <td className="p-3 font-bold text-white">{t.name}</td>
                        <td className="p-3 text-slate-300">{t.specialty}</td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-400">
                          188 يوم
                        </td>
                        <td className="p-3 text-center font-mono text-amber-300">
                          {t.leaveBalance?.emergency ? 7 - t.leaveBalance.emergency : 1} / 7
                        </td>
                        <td className="p-3 text-center font-mono text-rose-300">
                          {t.leaveBalance?.sick ? 14 - t.leaveBalance.sick : 2} / 14
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ممتاز
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SubTab 5: INDIVIDUAL TEACHER REPORT */}
          {reportSubTab === 'individual' && (
            <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              {(() => {
                const targetTeacher = teachers.find((t) => t.id === selectedTeacherForReport);
                if (!targetTeacher) return null;
                const teacherRecords = allAttendance.filter((r) => r.teacherId === targetTeacher.id);
                const pDays = teacherRecords.filter((r) => r.status === 'حاضر').length;
                const eDays = teacherRecords.filter((r) => r.status === 'طارئة').length;
                const sDays = teacherRecords.filter((r) => r.status === 'مرضية').length;
                const dDays = teacherRecords.filter((r) => r.status === 'مغادرة').length;

                return (
                  <div className="space-y-6">
                    {/* Official Dossier Box */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-950 via-slate-900 to-blue-950 border border-sky-600/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs text-cyan-300 font-bold mb-1">
                          سجل دوام المعلم المفرد (كشف رسمي)
                        </div>
                        <h3 className="text-2xl font-black text-white">{targetTeacher.name}</h3>
                        <div className="text-xs text-sky-200 mt-1 flex flex-wrap gap-3">
                          <span>الرقم الوظيفي: {targetTeacher.id}</span>
                          <span>•</span>
                          <span>التخصص: {targetTeacher.specialty}</span>
                          <span>•</span>
                          <span>الهاتف: {targetTeacher.phone}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => window.print()}
                          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
                        >
                          <Printer className="w-4 h-4" />
                          <span>طباعة كشف المعلم</span>
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-2xl bg-slate-800 text-center">
                        <div className="text-xs text-sky-300">أيام الحضور</div>
                        <div className="text-2xl font-black text-white">{pDays}</div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-800 text-center">
                        <div className="text-xs text-amber-300">إجازات طارئة</div>
                        <div className="text-2xl font-black text-amber-300">{eDays}</div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-800 text-center">
                        <div className="text-xs text-rose-300">إجازات مرضية</div>
                        <div className="text-2xl font-black text-rose-300">{sDays}</div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-800 text-center">
                        <div className="text-xs text-purple-300">المغادرات</div>
                        <div className="text-2xl font-black text-purple-300">{dDays}</div>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-800 text-sky-300">
                            <th className="p-2.5">التاريخ</th>
                            <th className="p-2.5">اليوم</th>
                            <th className="p-2.5">الوقت</th>
                            <th className="p-2.5">الحالة</th>
                            <th className="p-2.5">الملاحظات</th>
                            <th className="p-2.5">الموقع الجغرافي</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-200">
                          {teacherRecords.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-6 text-slate-400">
                                لا توجد سجلات بعد لهذا المعلم
                              </td>
                            </tr>
                          ) : (
                            teacherRecords.map((r) => (
                              <tr key={r.id}>
                                <td className="p-2.5 font-mono">{r.date}</td>
                                <td className="p-2.5">{formatDateArabic(r.date).split('،')[0]}</td>
                                <td className="p-2.5 font-mono">{formatTimeArabic(r.time)}</td>
                                <td className="p-2.5 font-bold">{r.status}</td>
                                <td className="p-2.5">{r.notes || '---'}</td>
                                <td className="p-2.5 text-[11px] text-slate-400">
                                  {r.location?.withinGeofence ? '✓ داخل المدرسة' : 'تسجيل رسمي'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Print Signatures */}
                    <div className="hidden print:flex justify-between items-center pt-12 text-black text-xs">
                      <div>
                        <div>توقيع المعلم: ________________</div>
                        <div className="mt-1 font-bold">{targetTeacher.name}</div>
                      </div>
                      <div>
                        <div>اعتماد مدير المدرسة: ________________</div>
                        <div className="mt-1 font-bold">لؤي تيسير نمر الخطيب</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* SubTab 6: GROUP REPORT (EMIS FORMAT MATCHING PDF) */}
          {reportSubTab === 'group' && (
            <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sky-800/40">
                <div>
                  <h4 className="font-bold text-white text-base">
                    كشف أحوال الموظفين للعام الدراسي 2026-2027 (وكالة الغوث الدولية)
                  </h4>
                  <p className="text-xs text-sky-200/70">
                    كشف مطابق لنظام إدارة معلومات التعليم (EMIS) المعتمد في وكالة الغوث
                  </p>
                </div>
                <div className="text-xs bg-sky-950 px-3 py-1.5 rounded-xl border border-sky-700 font-mono text-cyan-300">
                  رمز المدرسة: 10000596
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-sky-300 border-b border-sky-700/40">
                      <th className="p-2.5">م</th>
                      <th className="p-2.5">الرقم الوظيفي</th>
                      <th className="p-2.5">اسم الموظف</th>
                      <th className="p-2.5">المسمى الوظيفي</th>
                      <th className="p-2.5">التخصص</th>
                      <th className="p-2.5">الهاتف المحمول</th>
                      <th className="p-2.5">حالة اليوم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {teachers.map((t, idx) => {
                      const todayRec = activeRecordMap.get(t.id);
                      return (
                        <tr key={t.id} className="hover:bg-slate-800/30">
                          <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-2.5 font-mono font-bold text-sky-300">{t.id}</td>
                          <td className="p-2.5 font-bold text-white">{t.name}</td>
                          <td className="p-2.5 text-slate-300">{t.jobTitle}</td>
                          <td className="p-2.5 text-slate-300">{t.specialty}</td>
                          <td className="p-2.5 font-mono text-slate-400">{t.phone}</td>
                          <td className="p-2.5">
                            {todayRec ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                    todayRec.status === 'حاضر'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-amber-500/20 text-amber-300'
                                  }`}
                                >
                                  {todayRec.status}
                                </span>
                                {todayRec.isOfflineRecord && (
                                  <span
                                    title="سُجّل بدون إنترنت وتمت مزامنته تلقائياً"
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/80 text-amber-300 border border-amber-500/30 font-semibold"
                                  >
                                    أوفلاين 📶
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500">لم يسجل</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: STAFF DIRECTORY & MANAGEMENT (CRUD TEACHERS) */}
      {/* ======================================================== */}
      {activeTab === 'staff' && (
        <div className="bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-sky-800/40">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                <span>إدارة وتعديل كادر المعلمين والموظفين ({teachers.length})</span>
              </h3>
              <p className="text-xs text-sky-200/70 mt-0.5">
                يمكن للمدير إضافة معلمين جدد، أو تعديل أسمائهم وأرقامهم الوظيفية وتخصصاتهم، أو حذفهم.
              </p>
            </div>

            <button
              onClick={handleOpenAddTeacher}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة معلم جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-800 text-sky-300 border-b border-sky-700/40">
                  <th className="p-3">#</th>
                  <th className="p-3">الرقم الوظيفي</th>
                  <th className="p-3">اسم المعلم</th>
                  <th className="p-3">المسمى الوظيفي</th>
                  <th className="p-3">التخصص</th>
                  <th className="p-3">الهاتف المحمول</th>
                  <th className="p-3">الدور</th>
                  <th className="p-3 text-center">العمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {teachers.map((teacher, index) => (
                  <tr key={teacher.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 text-slate-400 font-mono">{index + 1}</td>
                    <td className="p-3 font-mono font-bold text-sky-300">{teacher.id}</td>
                    <td className="p-3 font-bold text-white">{teacher.name}</td>
                    <td className="p-3 text-slate-300">{teacher.jobTitle}</td>
                    <td className="p-3 text-slate-300">{teacher.specialty}</td>
                    <td className="p-3 font-mono text-slate-400 text-xs">{teacher.phone}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          teacher.role === 'principal'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {teacher.role === 'principal' ? 'مدير' : 'معلم'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenEditTeacher(teacher)}
                          className="p-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 transition"
                          title="تعديل بيانات المعلم"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {teacher.role !== 'principal' && (
                          <button
                            onClick={() => handleDeleteTeacherClick(teacher)}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 transition"
                            title="حذف المعلم"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: GEOFENCING SETTINGS (SCHOOL LOCATION CONTROL) */}
      {/* ======================================================== */}
      {activeTab === 'geofence' && (
        <div className="max-w-4xl mx-auto bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-sky-800/40">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-xs font-bold mb-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>التحقق من التواجد الجغرافي للمعلمين</span>
              </div>
              <h3 className="text-xl font-black text-white">
                إعدادات الموقع الجغرافي لمدرسة ذكور مدينة اربد الاعدادية الثانية
              </h3>
              <p className="text-xs text-sky-200/80 mt-1">
                الموقع: إربد - شارع فوعرا (يمكن للمدير تفعيل أو تعطيل النطاق الجغرافي أو تحديث الإحداثيات)
              </p>
            </div>

            {/* Geofence Toggle Button */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-sky-200">
                {geoEdit.enabled ? 'التحقق مفعل' : 'التحقق معطل'}
              </span>
              <button
                type="button"
                onClick={() => setGeoEdit((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-14 h-8 rounded-full transition-colors relative p-1 ${
                  geoEdit.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full bg-white transition-transform ${
                    geoEdit.enabled ? 'translate-x-0' : '-translate-x-6'
                  }`}
                />
              </button>
            </div>
          </div>

          {geoSuccessMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>تم حفظ وتطبيق إعدادات الموقع الجغرافي بنجاح على السحابة!</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1.5">
                خط العرض (Latitude)
              </label>
              <input
                type="number"
                step="any"
                value={geoEdit.latitude}
                onChange={(e) =>
                  setGeoEdit((prev) => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))
                }
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white font-mono text-sm outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1.5">
                خط الطول (Longitude)
              </label>
              <input
                type="number"
                step="any"
                value={geoEdit.longitude}
                onChange={(e) =>
                  setGeoEdit((prev) => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))
                }
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white font-mono text-sm outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1.5">
                نصف القطر المسموح به (بالمتر)
              </label>
              <select
                value={geoEdit.radiusMeters}
                onChange={(e) =>
                  setGeoEdit((prev) => ({ ...prev, radiusMeters: parseInt(e.target.value, 10) }))
                }
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white text-sm outline-none focus:border-cyan-400"
              >
                <option value={100}>100 متر (دقيق جداً داخل المبنى)</option>
                <option value={200}>200 متر (مبنى المدرسة والساحات)</option>
                <option value={350}>350 متر (موصى به - محيط المدرسة كاملاً)</option>
                <option value={500}>500 متر (نصف كيلومتر)</option>
                <option value={1000}>1000 متر (1 كم - منطقة فوعرا)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-sky-200 mb-1.5">
                تسمية الموقع للموظفين
              </label>
              <input
                type="text"
                value={geoEdit.locationLabel}
                onChange={(e) => setGeoEdit((prev) => ({ ...prev, locationLabel: e.target.value }))}
                className="w-full bg-slate-800 border border-sky-700/40 rounded-2xl px-4 py-2.5 text-white text-sm outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Calendar Permissions Section for Teachers */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-950 via-slate-800 to-indigo-950 border border-sky-600/50 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  <h4 className="font-bold text-white text-sm sm:text-base">
                    خاصية اختيار التاريخ من التقويم للمعلمين (أثر رجعي / إجازات مسبقة)
                  </h4>
                </div>
                <p className="text-xs text-sky-200/80 mt-1 leading-relaxed">
                  عند تفعيل هذه الميزة: يتمكن المعلم من فتح التقويم في حسابه واختيار أي يوم سابق لتسجيل حضوره أو غيابه بأثر رجعي، أو اختيار تاريخ مستقبلي لتقديم طلب إجازة أو مغادرة مسبقة.
                  <br />
                  عند تعطيلها: يقتصر تسجيل المعلم على تاريخ اليوم فقط، مع بقاء صلاحية الأثر الرجعي متاحة للمدير دائماً.
                </p>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-xs font-bold text-white">
                  {geoEdit.allowCustomDateForTeachers ? 'مفعلة للمعلم' : 'معطلة للمعلم'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setGeoEdit((prev) => ({
                      ...prev,
                      allowCustomDateForTeachers: !prev.allowCustomDateForTeachers,
                    }))
                  }
                  className={`w-14 h-8 rounded-full transition-colors relative p-1 ${
                    geoEdit.allowCustomDateForTeachers ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white transition-transform ${
                      geoEdit.allowCustomDateForTeachers ? 'translate-x-0' : '-translate-x-6'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Helper Button: Use Current GPS */}
          <div className="p-4 rounded-2xl bg-sky-950/60 border border-sky-700/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-sky-200 leading-relaxed text-center sm:text-right">
              هل أنت متواجد الآن في المدرسة؟ يمكنك بنقرة واحدة التقاط إحداثيات موقعك الحالي عبر GPS
              وتعيينه كإحداثيات رسمية للمدرسة.
            </div>

            <button
              type="button"
              onClick={handleSetCurrentGpsAsSchool}
              disabled={fetchingGps}
              className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition"
            >
              <Compass className={`w-4 h-4 ${fetchingGps ? 'animate-spin' : ''}`} />
              <span>{fetchingGps ? 'جارٍ تحديد موقعك...' : 'تعيين موقعي الحالي للمدرسة'}</span>
            </button>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSaveGeofence}
              disabled={geoSaving}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/20 transition"
            >
              {geoSaving ? 'جارٍ حفظ الإعدادات...' : 'حفظ إعدادات الموقع وصلاحيات التقويم'}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: MOBILE NOTIFICATIONS & LIVE ALERTS LOG */}
      {/* ======================================================== */}
      {activeTab === 'notifications' && (
        <div className="max-w-4xl mx-auto bg-slate-900/80 border border-sky-700/40 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-sky-800/40">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-xs font-bold mb-1">
                <Bell className="w-3.5 h-3.5" />
                <span>إشعارات هاتف المدير المباشرة</span>
              </div>
              <h3 className="text-xl font-black text-white">
                تنبيهات فورية عند تسجيل أي معلم لحضوره
              </h3>
              <p className="text-xs text-sky-200/80 mt-1">
                وفق البند العاشر: يصل إشعار مباشر لهاتف المدير مصحوباً بنغمة عند تسجيل أي معلم
              </p>
            </div>

            <button
              onClick={() => {
                onRequestPushNotifications();
                sounds.playNotificationBell();
              }}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
            >
              <Bell className="w-4 h-4" />
              <span>اختبار صوت وإشعار الهاتف</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-bold text-white">حالة إشعارات المتصفح والهاتف: </span>
              <span
                className={`font-bold ${
                  pushStatus === 'granted' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {pushStatus === 'granted'
                  ? 'مفعلة (سيتلقى هاتفك التنبيهات المنبثقة)'
                  : 'غير مفعلة بعد - يرجى الضغط على زر التفعيل'}
              </span>
            </div>
            {pushStatus !== 'granted' && (
              <button
                onClick={onRequestPushNotifications}
                className="px-3 py-1.5 rounded-xl bg-cyan-500 text-white text-xs font-bold"
              >
                السماح بالإشعارات
              </button>
            )}
          </div>

          {/* Notifications Log */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                لا توجد إشعارات مسجلة حتى الآن
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition ${
                    n.type === 'update'
                      ? 'bg-amber-950/70 border-amber-500/60 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-800/70 border-sky-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 mt-0.5 ${
                        n.type === 'update'
                          ? 'bg-amber-500/30 text-amber-300'
                          : n.status === 'حاضر'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : n.status === 'طارئة'
                          ? 'bg-amber-500/20 text-amber-300'
                          : n.status === 'مرضية'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-purple-500/20 text-purple-300'
                      }`}
                    >
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-white text-sm">{n.teacherName}</span>
                        {n.type === 'update' ? (
                          <span className="bg-amber-500/30 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/50">
                            ✏️ تم تعديل الحضور
                          </span>
                        ) : n.type === 'retroactive' ? (
                          <span className="bg-sky-500/30 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-sky-400/50">
                            🕒 أثر رجعي
                          </span>
                        ) : n.type === 'future' ? (
                          <span className="bg-purple-500/30 text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-400/50">
                            📅 طلب مستقبلي
                          </span>
                        ) : null}
                      </div>
                      <div className="text-slate-200 leading-relaxed font-medium">{n.message}</div>
                    </div>
                  </div>

                  <div className="text-right sm:text-left font-mono shrink-0 bg-black/40 px-3 py-1.5 rounded-xl border border-slate-700/60 self-stretch sm:self-auto flex sm:flex-col justify-between items-center sm:items-end">
                    <div className="text-[10px] text-slate-400">تاريخ الإجراء: {n.date}</div>
                    <div className="text-amber-300 font-bold text-xs flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>{n.exactChangeTime || n.time} بالثانية</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: MANUAL ATTENDANCE REGISTRATION FOR TEACHER */}
      {/* ======================================================== */}
      {manualRecordModal.open && manualRecordModal.teacher && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-sky-600/50 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-white text-lg">
              تسجيل دوام للمعلم: {manualRecordModal.teacher.name}
            </h3>
            <p className="text-xs text-sky-200/80">
              الرقم الوظيفي: {manualRecordModal.teacher.id} • التخصص:{' '}
              {manualRecordModal.teacher.specialty}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-sky-200 mb-1">الحالة</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['حاضر', 'طارئة', 'مرضية', 'مغادرة'] as AttendanceStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setManualRecordModal((prev) => ({ ...prev, status: st }))}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        manualRecordModal.status === st
                          ? 'bg-cyan-500 border-cyan-400 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {manualRecordModal.status === 'مغادرة' && (
                <div>
                  <label className="block text-xs font-bold text-purple-200 mb-1">وقت المغادرة</label>
                  <input
                    type="time"
                    value={manualRecordModal.departureTime}
                    onChange={(e) =>
                      setManualRecordModal((prev) => ({ ...prev, departureTime: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-purple-500/40 rounded-xl px-3 py-2 text-white text-xs outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-sky-200 mb-1">ملاحظة المدير</label>
                <input
                  type="text"
                  value={manualRecordModal.notes}
                  onChange={(e) =>
                    setManualRecordModal((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="سبب الإجازة أو عذر الغياب..."
                  className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-sky-200 mb-1">تاريخ التسجيل</label>
                <input
                  type="date"
                  value={manualRecordModal.date}
                  onChange={(e) =>
                    setManualRecordModal((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setManualRecordModal((prev) => ({ ...prev, open: false }))}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveManualRecord}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs"
              >
                حفظ التسجيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD / EDIT TEACHER */}
      {/* ======================================================== */}
      {teacherModal.open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-sky-600/50 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-white text-lg">
              {teacherModal.isEdit ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد إلى كادر المدرسة'}
            </h3>

            <form onSubmit={handleSaveTeacher} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">الرقم الوظيفي</label>
                  <input
                    type="text"
                    value={teacherModal.id}
                    onChange={(e) => setTeacherModal((prev) => ({ ...prev, id: e.target.value }))}
                    className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">اسم المعلم رباعي</label>
                  <input
                    type="text"
                    value={teacherModal.name}
                    onChange={(e) => setTeacherModal((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white text-xs outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">المسمى الوظيفي</label>
                  <input
                    type="text"
                    value={teacherModal.jobTitle}
                    onChange={(e) =>
                      setTeacherModal((prev) => ({ ...prev, jobTitle: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">التخصص</label>
                  <input
                    type="text"
                    value={teacherModal.specialty}
                    onChange={(e) =>
                      setTeacherModal((prev) => ({ ...prev, specialty: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">الهاتف المحمول</label>
                  <input
                    type="text"
                    value={teacherModal.phone}
                    onChange={(e) => setTeacherModal((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-sky-200 mb-1">الرقم الوطني / الهوية</label>
                  <input
                    type="text"
                    value={teacherModal.nationalId}
                    onChange={(e) =>
                      setTeacherModal((prev) => ({ ...prev, nationalId: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-sky-200 mb-1">
                  كلمة المرور للدخول (الافتراضية: 12345)
                </label>
                <input
                  type="text"
                  value={teacherModal.password || ''}
                  onChange={(e) =>
                    setTeacherModal((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder={teacherModal.isEdit ? 'اترك فارغاً لعدم التغيير' : '12345'}
                  className="w-full bg-slate-800 border border-sky-700/40 rounded-xl px-3 py-2 text-white text-xs outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setTeacherModal((prev) => ({ ...prev, open: false }))}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs"
                >
                  {teacherModal.isEdit ? 'حفظ التعديلات' : 'إضافة المعلم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
