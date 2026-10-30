import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INITIAL_GEOFENCE_SETTINGS, INITIAL_TEACHERS } from './src/data/initialStaff.ts';
import { AttendanceRecord, GeofenceSettings, NotificationItem, Teacher } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'school_attendance.json');

// Memory cache of state
interface DbState {
  teachers: Teacher[];
  attendance: AttendanceRecord[];
  settings: GeofenceSettings;
  notifications: NotificationItem[];
}

let db: DbState = {
  teachers: [...INITIAL_TEACHERS],
  attendance: [],
  settings: { ...INITIAL_GEOFENCE_SETTINGS },
  notifications: [],
};

// Seed sample attendance for previous school days in current month so reports look populated
function generateSampleHistoricalData(teachers: Teacher[]): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const today = new Date();
  
  // Generate for past 10 working days
  for (let i = 1; i <= 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Skip Friday (5) and Saturday (6) - UNRWA Jordan schools weekend
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) continue;

    const dateStr = d.toISOString().split('T')[0];

    teachers.forEach((teacher, idx) => {
      // Semi-realistic pattern: most present, occasional sick/emergency/departure
      let status: AttendanceRecord['status'] = 'حاضر';
      let notes = '';
      let departureTime: string | undefined;

      const seed = (idx * 17 + i * 13) % 100;
      if (seed < 4) {
        status = 'طارئة';
        notes = 'ظرف عائلي طارئ';
      } else if (seed < 7) {
        status = 'مرضية';
        notes = 'مراجعة طبية عيادة الوكالة';
      } else if (seed < 12) {
        status = 'مغادرة';
        departureTime = '11:30';
        notes = 'مغادرة رسمية مرخصة - ساعة ونصف';
      }

      const hour = 7;
      const minute = String(20 + (idx % 25)).padStart(2, '0');
      const timeStr = `0${hour}:${minute}:00`;

      records.push({
        id: `rec-${dateStr}-${teacher.id}`,
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: dateStr,
        time: timeStr,
        status,
        notes,
        departureTime,
        location: {
          latitude: INITIAL_GEOFENCE_SETTINGS.latitude + (Math.random() - 0.5) * 0.0005,
          longitude: INITIAL_GEOFENCE_SETTINGS.longitude + (Math.random() - 0.5) * 0.0005,
          distanceMeters: Math.floor(Math.random() * 80 + 20),
          withinGeofence: true,
        },
        recordedBy: 'teacher',
        timestamp: d.getTime(),
      });
    });
  }

  return records;
}

// Load or initialize DB
function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      db = {
        teachers: parsed.teachers || INITIAL_TEACHERS,
        attendance: parsed.attendance || [],
        settings: parsed.settings || INITIAL_GEOFENCE_SETTINGS,
        notifications: parsed.notifications || [],
      };
      console.log(`Database loaded successfully. ${db.teachers.length} teachers, ${db.attendance.length} records.`);
    } else {
      console.log('Initializing fresh database with 31 staff members...');
      db = {
        teachers: [...INITIAL_TEACHERS],
        attendance: generateSampleHistoricalData(INITIAL_TEACHERS),
        settings: { ...INITIAL_GEOFENCE_SETTINGS },
        notifications: [
          {
            id: 'notif-init',
            teacherId: '10510884',
            teacherName: 'مدير المدرسة لؤي الخطيب',
            status: 'حاضر',
            time: '07:15:00',
            date: new Date().toISOString().split('T')[0],
            timestamp: Date.now(),
            read: false,
            message: 'تم تدشين نظام تسجيل الحضور الالكتروني لمدرسة ذكور مدينة اربد الاعدادية الثانية.',
          },
        ],
      };
      saveDatabase();
    }
  } catch (err) {
    console.error('Error loading database, using memory fallback:', err);
  }
}

function saveDatabase() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// SSE Clients for real-time live synchronization across all devices
const sseClients = new Set<Response>();

function broadcastSSE(eventType: string, data: any) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Haversine formula to calculate distance in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Routes
// SSE endpoint
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Get initial app state
app.get('/api/initial-data', (req: Request, res: Response) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = db.attendance.filter((r) => r.date === todayStr);

  res.json({
    teachers: db.teachers.map(({ password, ...t }) => t), // Return public fields
    todayAttendance,
    settings: db.settings,
    notifications: db.notifications.slice(0, 50),
    serverTime: new Date().toISOString(),
  });
});

// Authentication
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { id, password } = req.body;
  if (!id || !password) {
    return res.status(400).json({ error: 'يرجى إدخال الرقم الوظيفي وكلمة المرور' });
  }

  const teacher = db.teachers.find((t) => t.id === String(id).trim());
  if (!teacher) {
    return res.status(401).json({ error: 'الرقم الوظيفي غير موجود في سجلات المدرسة' });
  }

  // Default password is '12345'
  const expectedPassword = teacher.password || '12345';
  if (password !== expectedPassword) {
    return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  }

  const { password: _, ...safeTeacher } = teacher;
  res.json({ user: safeTeacher });
});

// Change Password
app.post('/api/auth/change-password', (req: Request, res: Response) => {
  const { id, currentPassword, newPassword } = req.body;
  if (!id || !newPassword) {
    return res.status(400).json({ error: 'بيانات غير مكتملة' });
  }

  const teacher = db.teachers.find((t) => t.id === String(id));
  if (!teacher) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  if (currentPassword && (teacher.password || '12345') !== currentPassword) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }

  teacher.password = String(newPassword);
  saveDatabase();

  res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
});

// Query attendance records with date filters
app.get('/api/attendance', (req: Request, res: Response) => {
  const { date, teacherId, month, year } = req.query;
  let filtered = [...db.attendance];

  if (date) {
    filtered = filtered.filter((r) => r.date === String(date));
  }
  if (teacherId) {
    filtered = filtered.filter((r) => r.teacherId === String(teacherId));
  }
  if (month && year) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    filtered = filtered.filter((r) => r.date.startsWith(prefix));
  } else if (year) {
    filtered = filtered.filter((r) => r.date.startsWith(String(year)));
  }

  res.json({ records: filtered });
});

// Record attendance (Single)
app.post('/api/attendance', (req: Request, res: Response) => {
  const {
    teacherId,
    status,
    notes,
    departureTime,
    departureDuration,
    latitude,
    longitude,
    recordedBy,
    customDate,
  } = req.body;

  if (!teacherId || !status) {
    return res.status(400).json({ error: 'بيانات التسجيل غير مكتملة' });
  }

  const teacher = db.teachers.find((t) => t.id === String(teacherId));
  if (!teacher) {
    return res.status(404).json({ error: 'المعلم غير موجود في الكادر' });
  }

  const now = new Date();
  const dateStr = customDate || now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  // Geofence check if recorded by teacher
  let withinGeofence = true;
  let distanceMeters: number | undefined;

  if (latitude !== undefined && longitude !== undefined) {
    distanceMeters = calculateDistanceMeters(
      db.settings.latitude,
      db.settings.longitude,
      Number(latitude),
      Number(longitude)
    );
    withinGeofence = distanceMeters <= db.settings.radiusMeters;
  }

  // If geofencing is enabled and recorded by teacher, enforce location
  if (db.settings.enabled && recordedBy === 'teacher') {
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: 'يجب تفعيل خدمة تحديد الموقع الجغرافي (GPS) للتحقق من تواجدك في المدرسة.',
      });
    }
    if (!withinGeofence) {
      return res.status(403).json({
        error: `أنت خارج النطاق الجغرافي المسموح لمدرسة ذكور مدينة اربد الإعدادية الثانية. المسافة الحالية: ${distanceMeters} متر (الحد المسموح: ${db.settings.radiusMeters} متر).`,
        distanceMeters,
      });
    }
  }

  // Check if already registered for this date
  const existingIdx = db.attendance.findIndex(
    (r) => r.teacherId === String(teacherId) && r.date === dateStr
  );

  const newRecord: AttendanceRecord = {
    id: existingIdx >= 0 ? db.attendance[existingIdx].id : `rec-${Date.now()}-${teacherId}`,
    teacherId: teacher.id,
    teacherName: teacher.name,
    date: dateStr,
    time: timeStr,
    status,
    notes: notes || '',
    departureTime,
    departureDuration,
    location:
      latitude !== undefined && longitude !== undefined
        ? {
            latitude: Number(latitude),
            longitude: Number(longitude),
            distanceMeters,
            withinGeofence,
          }
        : undefined,
    recordedBy: recordedBy || 'teacher',
    recordedByName: recordedBy === 'principal' ? 'مدير المدرسة (لؤي الخطيب)' : teacher.name,
    timestamp: Date.now(),
  };

  if (existingIdx >= 0) {
    db.attendance[existingIdx] = newRecord;
  } else {
    db.attendance.unshift(newRecord);
  }

  // Create real-time notification for the principal
  const notif: NotificationItem = {
    id: `notif-${Date.now()}`,
    teacherId: teacher.id,
    teacherName: teacher.name,
    status,
    time: timeStr,
    date: dateStr,
    timestamp: Date.now(),
    read: false,
    message: `قام المعلم ${teacher.name} بتسجيل حالته: (${status}) في تمام الساعة ${timeStr}`,
  };

  db.notifications.unshift(notif);
  if (db.notifications.length > 100) {
    db.notifications.pop();
  }

  saveDatabase();

  // Broadcast to all active browser windows & mobile devices in real time!
  broadcastSSE('ATTENDANCE_RECORDED', {
    record: newRecord,
    notification: notif,
  });

  res.json({
    success: true,
    record: newRecord,
    notification: notif,
    message: `تم تسجيل (${status}) بنجاح للمعلم ${teacher.name}`,
  });
});

// Batch Attendance (Manager marking multiple/all remaining as present)
app.post('/api/attendance/batch', (req: Request, res: Response) => {
  const { teacherIds, status, date } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const targetStatus = status || 'حاضر';
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const updatedRecords: AttendanceRecord[] = [];

  for (const tid of teacherIds) {
    const teacher = db.teachers.find((t) => t.id === String(tid));
    if (!teacher) continue;

    const existingIdx = db.attendance.findIndex(
      (r) => r.teacherId === teacher.id && r.date === targetDate
    );

    const record: AttendanceRecord = {
      id: existingIdx >= 0 ? db.attendance[existingIdx].id : `rec-${Date.now()}-${teacher.id}`,
      teacherId: teacher.id,
      teacherName: teacher.name,
      date: targetDate,
      time: timeStr,
      status: targetStatus,
      notes: 'تم التسجيل بواسطة إدارة المدرسة',
      recordedBy: 'principal',
      recordedByName: 'مدير المدرسة (لؤي الخطيب)',
      timestamp: Date.now(),
    };

    if (existingIdx >= 0) {
      db.attendance[existingIdx] = record;
    } else {
      db.attendance.unshift(record);
    }
    updatedRecords.push(record);
  }

  saveDatabase();
  broadcastSSE('BATCH_ATTENDANCE', { date: targetDate, records: updatedRecords });

  res.json({ success: true, count: updatedRecords.length, records: updatedRecords });
});

// Delete Attendance Record
app.delete('/api/attendance/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = db.attendance.findIndex((r) => r.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'السجل غير موجود' });
  }

  const removed = db.attendance.splice(idx, 1)[0];
  saveDatabase();
  broadcastSSE('ATTENDANCE_DELETED', { id, removed });

  res.json({ success: true, message: 'تم حذف السجل بنجاح' });
});

// Teacher Management (CRUD)
app.post('/api/teachers', (req: Request, res: Response) => {
  const { id, name, jobTitle, specialty, phone, nationalId, gender, role, password } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'الرقم الوظيفي واسم المعلم مطلوبان' });
  }

  const exists = db.teachers.some((t) => t.id === String(id));
  if (exists) {
    return res.status(400).json({ error: 'يوجد معلم مسجل مسبقاً بنفس الرقم الوظيفي' });
  }

  const newTeacher: Teacher = {
    id: String(id).trim(),
    name: String(name).trim(),
    jobTitle: jobTitle || 'معلم',
    specialty: specialty || 'عام',
    phone: phone || '',
    nationalId: nationalId || '',
    gender: gender || 'ذكر',
    role: role || 'teacher',
    password: password || '12345',
    leaveBalance: { emergency: 7, sick: 14 },
  };

  db.teachers.push(newTeacher);
  saveDatabase();
  broadcastSSE('TEACHER_ADDED', { teacher: newTeacher });

  const { password: _, ...safe } = newTeacher;
  res.json({ success: true, teacher: safe });
});

app.put('/api/teachers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const teacher = db.teachers.find((t) => t.id === id);
  if (!teacher) {
    return res.status(404).json({ error: 'المعلم غير موجود' });
  }

  const { newId, name, jobTitle, specialty, phone, nationalId, gender, role, password } = req.body;

  if (newId && newId !== id) {
    const exists = db.teachers.some((t) => t.id === String(newId));
    if (exists) {
      return res.status(400).json({ error: 'الرقم الوظيفي الجديد مستخدم بالفعل' });
    }
    // Update attendance references as well
    db.attendance.forEach((r) => {
      if (r.teacherId === id) r.teacherId = String(newId);
    });
    teacher.id = String(newId);
  }

  if (name) {
    teacher.name = String(name);
    db.attendance.forEach((r) => {
      if (r.teacherId === teacher.id) r.teacherName = teacher.name;
    });
  }
  if (jobTitle !== undefined) teacher.jobTitle = jobTitle;
  if (specialty !== undefined) teacher.specialty = specialty;
  if (phone !== undefined) teacher.phone = phone;
  if (nationalId !== undefined) teacher.nationalId = nationalId;
  if (gender !== undefined) teacher.gender = gender;
  if (role !== undefined) teacher.role = role;
  if (password) teacher.password = password;

  saveDatabase();
  broadcastSSE('TEACHER_UPDATED', { teacher });

  const { password: _, ...safe } = teacher;
  res.json({ success: true, teacher: safe });
});

app.delete('/api/teachers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = db.teachers.findIndex((t) => t.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'المعلم غير موجود' });
  }

  const removed = db.teachers.splice(idx, 1)[0];
  saveDatabase();
  broadcastSSE('TEACHER_DELETED', { id, removed });

  res.json({ success: true, message: 'تم حذف المعلم بنجاح' });
});

// Update Geofence Settings
app.post('/api/settings', (req: Request, res: Response) => {
  const { enabled, latitude, longitude, radiusMeters, schoolName, principalName, locationLabel } =
    req.body;

  if (enabled !== undefined) db.settings.enabled = Boolean(enabled);
  if (latitude !== undefined) db.settings.latitude = Number(latitude);
  if (longitude !== undefined) db.settings.longitude = Number(longitude);
  if (radiusMeters !== undefined) db.settings.radiusMeters = Number(radiusMeters);
  if (schoolName !== undefined) db.settings.schoolName = schoolName;
  if (principalName !== undefined) db.settings.principalName = principalName;
  if (locationLabel !== undefined) db.settings.locationLabel = locationLabel;

  saveDatabase();
  broadcastSSE('SETTINGS_UPDATED', { settings: db.settings });

  res.json({ success: true, settings: db.settings });
});

// Clear or mark notifications read
app.post('/api/notifications/mark-read', (req: Request, res: Response) => {
  db.notifications.forEach((n) => (n.read = true));
  saveDatabase();
  broadcastSSE('NOTIFICATIONS_READ', {});
  res.json({ success: true });
});

// Initialize database
loadDatabase();

// Dev vs Prod Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`نظام تسجيل الحضور الالكتروني يعمل على المنفذ: http://localhost:${PORT}`);
  });
}

startServer();
