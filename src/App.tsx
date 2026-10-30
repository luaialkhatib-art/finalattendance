import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  cacheTeachersForOffline,
  cacheSettingsForOffline,
  cacheAttendanceRecords,
  getCachedTeachers,
  getCachedSettings,
  getCachedRecords,
  getOfflineQueue,
  addToOfflineQueue,
  syncPendingOfflineRecords,
} from './utils/offlineSync.ts';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import {
  subscribeAttendance,
  subscribeNotifications,
  subscribeTeachers,
  subscribeSettings,
  saveAttendanceToFirebase,
  deleteAttendanceFromFirebase,
  saveNotificationToFirebase,
  markAllNotificationsReadInFirebase,
  saveTeacherToFirebase,
  deleteTeacherFromFirebase,
  saveSettingsToFirebase,
  seedInitialFirestoreData,
} from './firebase.ts';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Teacher | null>(() => {
    try {
      const saved = localStorage.getItem('school_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const cached = getCachedTeachers();
    return cached && cached.length > 0 ? cached : INITIAL_TEACHERS;
  });

  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>(() => {
    return getCachedRecords();
  });

  const [settings, setSettings] = useState<GeofenceSettings>(() => {
    const cached = getCachedSettings();
    return cached ? cached : INITIAL_GEOFENCE_SETTINGS;
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | 'unsupported'>('default');
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() => {
    return getOfflineQueue().length;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // References to prevent false notification alert on initial page load
  const isInitialLoadRef = useRef(true);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());

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
          body: 'تم تفعيل إشعارات هاتف ولابتوب المدير بنجاح! ستصلك التنبيهات الفورية السحابية عند تسجيل أي معلم.',
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

  // 1. Initialize Firebase Cloud Sync with Real-Time Listeners
  useEffect(() => {
    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }

    // Seed initial school staff & settings to Firestore if not present
    seedInitialFirestoreData(INITIAL_TEACHERS, INITIAL_GEOFENCE_SETTINGS).catch((err) => {
      console.warn('Firestore seed check failed:', err);
    });

    // Subscribe to real-time attendance changes from Firestore
    const unsubAttendance = subscribeAttendance(
      (records) => {
        setIsConnected(true);
        setAllAttendance(records);
        cacheAttendanceRecords(records);

        const today = new Date().toISOString().split('T')[0];
        setTodayAttendance(records.filter((r) => r.date === today));
      },
      (err) => {
        console.warn('Attendance sync status:', err);
      }
    );

    // Subscribe to real-time school notifications from Firestore
    const unsubNotifications = subscribeNotifications(
      (items) => {
        setIsConnected(true);

        // Check if there are newly arrived unread notifications
        if (!isInitialLoadRef.current && items.length > 0) {
          const newest = items[0];
          if (newest && !newest.read && !knownNotificationIdsRef.current.has(newest.id)) {
            // New notification arrived in real-time from phone/another device!
            if (soundEnabled) {
              sounds.playNotificationBell();
            }
            showPushNotification(
              'تسجيل حضور جديد - مدرسة ذكور مدينة اربد الاعدادية الثانية',
              newest.message
            );
          }
        }

        // Update known IDs
        items.forEach((item) => knownNotificationIdsRef.current.add(item.id));
        setNotifications(items);
        isInitialLoadRef.current = false;
      },
      (err) => {
        console.warn('Notifications sync status:', err);
      }
    );

    // Subscribe to teachers list from Firestore
    const unsubTeachers = subscribeTeachers(
      (teacherList) => {
        if (teacherList && teacherList.length > 0) {
          setTeachers(teacherList);
          cacheTeachersForOffline(teacherList);
        }
      },
      (err) => {
        console.warn('Teachers sync status:', err);
      }
    );

    // Subscribe to settings from Firestore
    const unsubSettings = subscribeSettings(
      (newSettings) => {
        if (newSettings) {
          setSettings(newSettings);
          cacheSettingsForOffline(newSettings);
        }
      },
      (err) => {
        console.warn('Settings sync status:', err);
      }
    );

    return () => {
      unsubAttendance();
      unsubNotifications();
      unsubTeachers();
      unsubSettings();
    };
  }, [soundEnabled]);

  // Synchronize pending offline records when network is available
  const handleSyncPendingOffline = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (isSyncing) return;

    const queue = getOfflineQueue();
    if (queue.length === 0) {
      setPendingOfflineCount(0);
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncPendingOfflineRecords(async (record) => {
        // Push directly to Firebase Firestore
        await saveAttendanceToFirebase(record);

        // Also post notification to Firestore
        const notif: NotificationItem = {
          id: `notif-${Date.now()}-${record.teacherId}`,
          teacherId: record.teacherId,
          teacherName: record.teacherName,
          status: record.status,
          time: record.time,
          date: new Date().toISOString().split('T')[0],
          targetDate: record.date,
          timestamp: Date.now(),
          read: false,
          type: 'create',
          exactChangeTime: new Date().toTimeString().split(' ')[0],
          message: `📶 تمت المزامنة السحابية: تم تسجيل دوام المعلم ${record.teacherName} (${record.status}) لتاريخ (${record.date}) الذي تم تسجيله أوفلاين بدون إنترنت!`,
        };
        await saveNotificationToFirebase(notif);

        return { success: true };
      });

      setPendingOfflineCount(result.remainingCount);
      if (result.syncedCount > 0) {
        if (soundEnabled) sounds.playSuccessChime();
      }
    } catch (e) {
      console.warn('Offline sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, soundEnabled]);

  // Auto-sync whenever returning online
  useEffect(() => {
    const onOnline = () => {
      setIsConnected(true);
      handleSyncPendingOffline();
    };

    const onOffline = () => {
      setIsConnected(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      handleSyncPendingOffline();
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [handleSyncPendingOffline]);

  // Authentication Handlers
  const handleLogin = async (id: string, pass: string) => {
    const trimmedId = id.trim();
    // 1. Try checking synchronized teachers list
    const teacher = teachers.find((t) => t.id === trimmedId);
    if (!teacher) {
      return { success: false, error: 'الرقم الوظيفي غير موجود في سجلات المدرسة' };
    }
    const expectedPass = teacher.password || '12345';
    if (pass !== expectedPass) {
      return { success: false, error: 'كلمة المرور غير صحيحة' };
    }
    const { password: _, ...safeUser } = teacher;
    setCurrentUser(safeUser);
    localStorage.setItem('school_user', JSON.stringify(safeUser));

    // Also attempt server-side login if express is active
    try {
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trimmedId, password: pass }),
      }).catch(() => {});
    } catch {}

    return { success: true };
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('school_user');
  };

  const handleChangePassword = async (newPassword: string) => {
    if (!currentUser) return { success: false, error: 'غير مسجل' };
    const updatedTeacher: Teacher = {
      ...currentUser,
      password: newPassword,
    };

    try {
      await saveTeacherToFirebase(updatedTeacher);
      setTeachers((prev) =>
        prev.map((t) => (t.id === currentUser.id ? updatedTeacher : t))
      );
      // Optional backend call
      fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentUser.id, newPassword }),
      }).catch(() => {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'حدث خطأ أثناء حفظ كلمة المرور' };
    }
  };

  // Attendance Recording: Direct to Firebase with instant optimistic update & offline fallback
  const handleRecordAttendance = async (payload: any) => {
    const now = new Date();
    const dateStr = payload.customDate || now.toISOString().split('T')[0];
    const exactChangeTime = now.toTimeString().split(' ')[0]; // Exact HH:mm:ss

    // Check if existing record exists for this date and teacher
    const existing = allAttendance.find(
      (r) => r.teacherId === payload.teacherId && r.date === dateStr
    );
    const isUpdate = existing !== undefined;
    const previousStatus = existing?.status;
    const teacherName = teachers.find((t) => t.id === payload.teacherId)?.name || 'معلم';

    const localRecord: AttendanceRecord = {
      id: `${dateStr}_${payload.teacherId}`,
      teacherId: payload.teacherId,
      teacherName,
      date: dateStr,
      time: isUpdate ? existing.time : exactChangeTime,
      status: payload.status,
      notes: payload.notes || '',
      departureTime: payload.departureTime,
      departureDuration: payload.departureDuration,
      recordedBy: payload.recordedBy || 'teacher',
      timestamp: isUpdate ? existing.timestamp : Date.now(),
      isModified: isUpdate,
      previousStatus: isUpdate ? previousStatus : undefined,
      lastModifiedAt: Date.now(),
      lastModifiedTime: exactChangeTime,
      lastModifiedDate: now.toISOString().split('T')[0],
      location: payload.latitude && payload.longitude ? {
        latitude: payload.latitude,
        longitude: payload.longitude,
        withinGeofence: true,
      } : existing?.location,
    };

    let notifMsg = '';
    let notifType: NotificationItem['type'] = isUpdate ? 'update' : 'create';

    if (isUpdate) {
      notifMsg = `⚠️ تعديل حضور: قام المعلم ${teacherName} بتعديل حالته لتاريخ (${dateStr}) من [${previousStatus}] إلى [${payload.status}] في تمام الساعة ${exactChangeTime} بالتحديد!`;
      notifType = 'update';
    } else if (dateStr < now.toISOString().split('T')[0]) {
      notifMsg = `🕒 تسجيل بأثر رجعي: قام المعلم ${teacherName} بتسجيل (${payload.status}) لتاريخ سابق (${dateStr}) في تمام الساعة ${exactChangeTime}!`;
      notifType = 'retroactive';
    } else if (dateStr > now.toISOString().split('T')[0]) {
      notifMsg = `📅 طلب إجازة مسبقة: قام المعلم ${teacherName} بتقديم (${payload.status}) لتاريخ مستقبلي (${dateStr}) في تمام الساعة ${exactChangeTime}!`;
      notifType = 'future';
    } else {
      notifMsg = `✓ تسجيل دوام: قام المعلم ${teacherName} بتسجيل حالته (${payload.status}) لليوم في تمام الساعة ${exactChangeTime}!`;
      notifType = 'create';
    }

    const notif: NotificationItem = {
      id: `notif-${Date.now()}-${payload.teacherId}`,
      teacherId: localRecord.teacherId,
      teacherName: localRecord.teacherName,
      status: localRecord.status,
      previousStatus,
      time: exactChangeTime,
      date: now.toISOString().split('T')[0],
      targetDate: dateStr,
      timestamp: Date.now(),
      read: false,
      type: notifType,
      exactChangeTime,
      message: notifMsg,
    };

    // Optimistic local update so user on mobile sees immediate confirmation
    setTodayAttendance((prev) => [
      localRecord,
      ...prev.filter((r) => !(r.teacherId === localRecord.teacherId && r.date === localRecord.date)),
    ]);
    setAllAttendance((prev) => [
      localRecord,
      ...prev.filter((r) => !(r.teacherId === localRecord.teacherId && r.date === localRecord.date)),
    ]);
    setNotifications((prev) => [notif, ...prev]);

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      localRecord.isOfflineRecord = true;
      addToOfflineQueue(localRecord);
      setPendingOfflineCount(getOfflineQueue().length);
      return { success: true, record: localRecord, isOffline: true };
    }

    try {
      // 1. Primary: Save directly to Cloud Firestore
      await saveAttendanceToFirebase(localRecord);
      await saveNotificationToFirebase(notif);

      // 2. Also try server endpoint if running with express
      fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});

      return { success: true, record: localRecord };
    } catch (err) {
      console.warn('Firebase direct save issue, queuing locally:', err);
      localRecord.isOfflineRecord = true;
      addToOfflineQueue(localRecord);
      setPendingOfflineCount(getOfflineQueue().length);
      return { success: true, record: localRecord, isOffline: true };
    }
  };

  // Principal batch attendance marking
  const handleBatchAttendance = async (
    teacherIds: string[],
    status: AttendanceStatus,
    date?: string
  ) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0];

    const batchRecords: AttendanceRecord[] = teacherIds.map((tid) => ({
      id: `${targetDate}_${tid}`,
      teacherId: tid,
      teacherName: teachers.find((t) => t.id === tid)?.name || 'معلم',
      date: targetDate,
      time: timeStr,
      status,
      notes: 'تم التسجيل بواسطة إدارة المدرسة',
      recordedBy: 'principal',
      recordedByName: 'مدير المدرسة (لؤي الخطيب)',
      timestamp: Date.now(),
    }));

    // Optimistic update
    setTodayAttendance((prev) => {
      const map = new Map(prev.map((r) => [r.teacherId, r]));
      batchRecords.forEach((r) => map.set(r.teacherId, r));
      return Array.from(map.values());
    });
    setAllAttendance((prev) => [...batchRecords, ...prev.filter((r) => !teacherIds.includes(r.teacherId) || r.date !== targetDate)]);

    try {
      // Save all to Firebase
      await Promise.all(batchRecords.map((r) => saveAttendanceToFirebase(r)));

      const notif: NotificationItem = {
        id: `notif-${Date.now()}-batch`,
        teacherId: 'all',
        teacherName: 'مدير المدرسة',
        status,
        time: timeStr,
        date: new Date().toISOString().split('T')[0],
        targetDate,
        timestamp: Date.now(),
        read: false,
        type: 'create',
        exactChangeTime: timeStr,
        message: `📋 قام مدير المدرسة بتسجيل حالة (${status}) جماعياً لـ (${teacherIds.length}) معلمين لتاريخ (${targetDate}).`,
      };
      await saveNotificationToFirebase(notif);

      // Also try backend if available
      fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherIds, status, date }),
      }).catch(() => {});

      return { success: true };
    } catch (err: any) {
      console.warn('Batch attendance save error:', err);
      return { success: true };
    }
  };

  // Delete attendance record
  const handleDeleteAttendance = async (id: string) => {
    try {
      await deleteAttendanceFromFirebase(id);
      setTodayAttendance((prev) => prev.filter((r) => r.id !== id));
      setAllAttendance((prev) => prev.filter((r) => r.id !== id));
      fetch(`/api/attendance/${id}`, { method: 'DELETE' }).catch(() => {});
      return { success: true };
    } catch (err: any) {
      setTodayAttendance((prev) => prev.filter((r) => r.id !== id));
      setAllAttendance((prev) => prev.filter((r) => r.id !== id));
      return { success: true };
    }
  };

  // Staff CRUD Handlers
  const handleAddTeacher = async (teacher: Partial<Teacher>) => {
    const newT: Teacher = {
      id: String(teacher.id).trim(),
      name: String(teacher.name).trim(),
      jobTitle: teacher.jobTitle || 'معلم',
      specialty: teacher.specialty || 'عام',
      phone: teacher.phone || '',
      nationalId: teacher.nationalId || '',
      gender: teacher.gender || 'ذكر',
      role: teacher.role || 'teacher',
      password: teacher.password || '12345',
      leaveBalance: { emergency: 7, sick: 14 },
    };

    try {
      await saveTeacherToFirebase(newT);
      setTeachers((prev) => [...prev, newT]);
      fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newT),
      }).catch(() => {});
      return { success: true };
    } catch (err: any) {
      setTeachers((prev) => [...prev, newT]);
      return { success: true };
    }
  };

  const handleUpdateTeacher = async (id: string, updates: Partial<Teacher>) => {
    const existing = teachers.find((t) => t.id === id);
    if (!existing) return { success: false, error: 'المعلم غير موجود' };
    const updated: Teacher = { ...existing, ...updates };

    try {
      await saveTeacherToFirebase(updated);
      setTeachers((prev) => prev.map((t) => (t.id === id ? updated : t)));
      fetch(`/api/teachers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
      return { success: true };
    } catch (err: any) {
      setTeachers((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return { success: true };
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    try {
      await deleteTeacherFromFirebase(id);
      setTeachers((prev) => prev.filter((t) => t.id !== id));
      fetch(`/api/teachers/${id}`, { method: 'DELETE' }).catch(() => {});
      return { success: true };
    } catch {
      setTeachers((prev) => prev.filter((t) => t.id !== id));
      return { success: true };
    }
  };

  // Settings Handler
  const handleUpdateSettings = async (newSettings: Partial<GeofenceSettings>) => {
    const updated: GeofenceSettings = { ...settings, ...newSettings };
    try {
      await saveSettingsToFirebase(updated);
      setSettings(updated);
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      }).catch(() => {});
      return { success: true };
    } catch (err: any) {
      setSettings(updated);
      return { success: true };
    }
  };

  // Notifications Mark as Read
  const handleClearNotifications = async () => {
    try {
      await markAllNotificationsReadInFirebase();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      fetch('/api/notifications/mark-read', { method: 'POST' }).catch(() => {});
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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

      {/* Offline Connectivity & Pending Sync Bar */}
      <OfflineIndicator
        pendingCount={pendingOfflineCount}
        onManualSync={handleSyncPendingOffline}
        isSyncing={isSyncing}
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
