import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { TeacherPortal } from './components/TeacherPortal.tsx';
import { PrincipalPortal } from './components/PrincipalPortal.tsx';
import {
  AttendanceRecord,
  AttendanceStatus,
  GeofenceSettings,
  NotificationItem,
  Teacher,
} from './types.ts';
import { INITIAL_GEOFENCE_SETTINGS, INITIAL_TEACHERS } from './data/initialStaff.ts';
import { sounds } from './utils/audio.ts';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Teacher | null>(() => {
    try {
      const saved = localStorage.getItem('school_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [teachers, setTeachers] = useState<Teacher[]>(INITIAL_TEACHERS);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<GeofenceSettings>(INITIAL_GEOFENCE_SETTINGS);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>('default');

  // Load initial app data
  const fetchData = useCallback(async () => {
    try {
      const [initRes, attRes] = await Promise.all([
        fetch('/api/initial-data'),
        fetch('/api/attendance'),
      ]);

      if (initRes.ok) {
        const data = await initRes.json();
        if (data.teachers) setTeachers(data.teachers);
        if (data.todayAttendance) setTodayAttendance(data.todayAttendance);
        if (data.settings) setSettings(data.settings);
        if (data.notifications) setNotifications(data.notifications);
        setIsConnected(true);
      }

      if (attRes.ok) {
        const attData = await attRes.json();
        if (attData.records) setAllAttendance(attData.records);
      }
    } catch (err) {
      console.warn('Initial data fetch error:', err);
      setIsConnected(false);
    }
  }, []);

  // Request browser Web Push notifications permission
  const requestPushPermission = () => {
    if (!('Notification' in window)) {
      setPushStatus('unsupported');
      alert('المتصفح الحالي لا يدعم إشعارات النظام المباشرة.');
      return;
    }

    Notification.requestPermission().then((permission) => {
      setPushStatus(permission);
      if (permission === 'granted') {
        new Notification('مدرسة ذكور مدينة اربد الاعدادية الثانية', {
          body: 'تم تفعيل إشعارات هاتف المدير بنجاح! ستصلك التنبيهات الفورية عند تسجيل أي معلم.',
          icon: '/favicon.ico',
        });
        sounds.playNotificationBell();
      }
    });
  };

  // Show push notification on Director's device
  const showPushNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('Push notification trigger error:', e);
      }
    }
  };

  // Setup Server-Sent Events (SSE) for Real-Time cloud sync across devices
  useEffect(() => {
    fetchData();

    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          setIsConnected(true);
        };

        eventSource.addEventListener('ATTENDANCE_RECORDED', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const { record, notification } = data;

            setTodayAttendance((prev) => {
              const idx = prev.findIndex(
                (r) => r.teacherId === record.teacherId && r.date === record.date
              );
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = record;
                return next;
              }
              return [record, ...prev];
            });

            setAllAttendance((prev) => {
              const idx = prev.findIndex(
                (r) => r.teacherId === record.teacherId && r.date === record.date
              );
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = record;
                return next;
              }
              return [record, ...prev];
            });

            if (notification) {
              setNotifications((prev) => [notification, ...prev.slice(0, 49)]);

              // Trigger sound & push notification
              if (soundEnabled) {
                sounds.playNotificationBell();
              }

              showPushNotification(
                'تسجيل حضور جديد - مدرسة ذكور مدينة اربد الاعدادية الثانية',
                notification.message
              );
            }
          } catch (err) {
            console.error('SSE parse error:', err);
          }
        });

        eventSource.addEventListener('BATCH_ATTENDANCE', (e: MessageEvent) => {
          const { records } = JSON.parse(e.data);
          setTodayAttendance((prev) => {
            const map = new Map(prev.map((r) => [r.teacherId, r]));
            records.forEach((r: AttendanceRecord) => map.set(r.teacherId, r));
            return Array.from(map.values());
          });
          fetchData();
        });

        eventSource.addEventListener('TEACHER_ADDED', (e: MessageEvent) => {
          const { teacher } = JSON.parse(e.data);
          setTeachers((prev) => [...prev, teacher]);
        });

        eventSource.addEventListener('TEACHER_UPDATED', (e: MessageEvent) => {
          const { teacher } = JSON.parse(e.data);
          setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? teacher : t)));
        });

        eventSource.addEventListener('TEACHER_DELETED', (e: MessageEvent) => {
          const { id } = JSON.parse(e.data);
          setTeachers((prev) => prev.filter((t) => t.id !== id));
        });

        eventSource.addEventListener('SETTINGS_UPDATED', (e: MessageEvent) => {
          const { settings: newSettings } = JSON.parse(e.data);
          setSettings(newSettings);
        });

        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource?.close();
          // Retry connecting in 4 seconds
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connectSSE, 4000);
        };
      } catch (err) {
        console.warn('SSE connection failed:', err);
        setIsConnected(false);
      }
    };

    connectSSE();

    // Fallback polling interval every 20 seconds
    const interval = setInterval(fetchData, 20000);

    return () => {
      eventSource?.close();
      clearTimeout(reconnectTimeout);
      clearInterval(interval);
    };
  }, [fetchData, soundEnabled]);

  // Auth Handlers
  const handleLogin = async (id: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pass }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'فشل تسجيل الدخول' };
      }

      setCurrentUser(data.user);
      localStorage.setItem('school_user', JSON.stringify(data.user));
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً' };
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('school_user');
  };

  const handleChangePassword = async (newPassword: string) => {
    if (!currentUser) return { success: false, error: 'غير مسجل' };
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentUser.id, newPassword }),
      });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  };

  // Attendance Handlers
  const handleRecordAttendance = async (payload: any) => {
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      return { success: true, record: data.record };
    } catch {
      return { success: false, error: 'خطأ في حفظ الحضور في السحابة' };
    }
  };

  const handleBatchAttendance = async (
    teacherIds: string[],
    status: AttendanceStatus,
    date?: string
  ) => {
    try {
      const res = await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherIds, status, date }),
      });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في التسجيل الجماعي' };
    }
  };

  const handleDeleteAttendance = async (id: string) => {
    try {
      const res = await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في الحذف' };
    }
  };

  // Teacher CRUD Handlers
  const handleAddTeacher = async (teacher: Partial<Teacher>) => {
    try {
      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teacher),
      });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في إضافة المعلم' };
    }
  };

  const handleUpdateTeacher = async (id: string, updates: Partial<Teacher>) => {
    try {
      const res = await fetch(`/api/teachers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في تعديل المعلم' };
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    try {
      const res = await fetch(`/api/teachers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في الحذف' };
    }
  };

  // Settings Handler
  const handleUpdateSettings = async (newSettings: Partial<GeofenceSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'خطأ في حفظ الإعدادات' };
    }
  };

  const handleClearNotifications = async () => {
    try {
      await fetch('/api/notifications/mark-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const teacherTodayRecord = currentUser
    ? todayAttendance.find((r) => r.teacherId === currentUser.id && r.date === todayStr)
    : undefined;

  const teacherHistoryRecords = currentUser
    ? allAttendance.filter((r) => r.teacherId === currentUser.id)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-sky-950 text-slate-100 flex flex-col font-['Cairo',sans-serif]">
      {/* Official Top Header */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        notifications={notifications}
        onClearNotifications={handleClearNotifications}
        isConnected={isConnected}
        settings={settings}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onRequestPushNotifications={requestPushPermission}
        pushStatus={pushStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {!currentUser ? (
          <LoginModal onLogin={handleLogin} />
        ) : currentUser.role === 'principal' ? (
          <PrincipalPortal
            principal={currentUser}
            teachers={teachers}
            todayAttendance={todayAttendance}
            allAttendance={allAttendance}
            settings={settings}
            notifications={notifications}
            onRecordAttendance={handleRecordAttendance}
            onBatchAttendance={handleBatchAttendance}
            onDeleteAttendance={handleDeleteAttendance}
            onAddTeacher={handleAddTeacher}
            onUpdateTeacher={handleUpdateTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            onUpdateSettings={handleUpdateSettings}
            onRequestPushNotifications={requestPushPermission}
            pushStatus={pushStatus}
          />
        ) : (
          <TeacherPortal
            teacher={currentUser}
            todayRecord={teacherTodayRecord}
            historyRecords={teacherHistoryRecords}
            settings={settings}
            onRecordAttendance={handleRecordAttendance}
            onChangePassword={handleChangePassword}
          />
        )}
      </main>

      {/* Official Footer */}
      <footer className="bg-slate-950 border-t border-sky-900/40 py-6 px-4 text-center text-xs text-sky-300/70 space-y-1">
        <div className="font-bold text-white">
          وكالة الغوث الدولية • دائرة التربية والتعليم - الأردن
        </div>
        <div>
          مدرسة ذكور مدينة اربد الاعدادية الثانية (مدرسة الخطيب - فوعرا) | رمز المدرسة: 10000596
        </div>
        <div className="text-[11px] text-slate-400">
          مدير المدرسة: الأستاذ لؤي الخطيب • نظام تسجيل الحضور والغياب الالكتروني المعتمد
        </div>
      </footer>
    </div>
  );
}
