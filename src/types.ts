export type AttendanceStatus = 'حاضر' | 'طارئة' | 'مرضية' | 'مغادرة';

export interface Teacher {
  id: string; // Employee ID (الرقم الوظيفي)
  name: string; // Employee Name (اسم الموظف)
  jobTitle: string; // المسمى الوظيفي
  specialty: string; // التخصص
  phone: string; // الهاتف المحمول
  nationalId?: string; // الرقم الوطني / الهوية
  gender: 'ذكر' | 'أنثى';
  role: 'principal' | 'teacher';
  password?: string;
  leaveBalance?: {
    emergency: number; // رصيد الإجازات العرضية/الطارئة (مثلاً 7 أيام)
    sick: number; // رصيد الإجازات المرضية (مثلاً 14 يوم)
  };
}

export interface AttendanceRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  status: AttendanceStatus;
  notes?: string;
  departureTime?: string; // وقت المغادرة
  departureDuration?: string; // مدة المغادرة (مثلاً ساعة أو ساعتين)
  location?: {
    latitude: number;
    longitude: number;
    distanceMeters?: number;
    withinGeofence: boolean;
  };
  recordedBy: 'teacher' | 'principal';
  recordedByName?: string;
  timestamp: number;
}

export interface GeofenceSettings {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  schoolName: string;
  principalName: string;
  locationLabel: string;
}

export interface NotificationItem {
  id: string;
  teacherId: string;
  teacherName: string;
  status: AttendanceStatus;
  time: string;
  date: string;
  timestamp: number;
  read: boolean;
  message: string;
}

export interface InitialDataResponse {
  teachers: Teacher[];
  todayAttendance: AttendanceRecord[];
  settings: GeofenceSettings;
  notifications: NotificationItem[];
  serverTime: string;
}
