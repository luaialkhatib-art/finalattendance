import { AttendanceRecord, Teacher } from '../types.ts';

export function formatDateArabic(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('ar-JO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function formatTimeArabic(timeStr: string): string {
  try {
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'م' : 'ص';
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export function exportAttendanceToCSV(
  records: AttendanceRecord[],
  teachers: Teacher[],
  filename = 'كشف_الحضور_والغياب.csv'
) {
  // UTF-8 BOM so Excel opens Arabic correctly
  const BOM = '\uFEFF';
  const headers = [
    'الرقم الوظيفي',
    'اسم المعلم',
    'التخصص',
    'التاريخ',
    'وقت التسجيل',
    'الحالة',
    'الملاحظات / سبب المغادرة',
    'الموقع الجغرافي',
    'جهة التسجيل',
  ];

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));

  const rows = records.map((r) => {
    const teacher = teacherMap.get(r.teacherId);
    const locationStatus = r.location
      ? r.location.withinGeofence
        ? `ضمن المدرسة (${r.location.distanceMeters || 0} م)`
        : `خارج النطاق (${r.location.distanceMeters || 0} م)`
      : 'غير محدد';

    return [
      `"${r.teacherId}"`,
      `"${r.teacherName}"`,
      `"${teacher?.specialty || ''}"`,
      `"${r.date}"`,
      `"${r.time}"`,
      `"${r.status}"`,
      `"${(r.notes || '') + (r.departureTime ? ` (مغادرة ${r.departureTime})` : '')}"`,
      `"${locationStatus}"`,
      `"${r.recordedByName || (r.recordedBy === 'principal' ? 'المدير' : 'المعلم')}"`,
    ];
  });

  const csvContent = BOM + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
