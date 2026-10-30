import { AttendanceRecord, Teacher, GeofenceSettings } from '../types.ts';

const QUEUE_STORAGE_KEY = 'school_attendance_offline_queue_v1';
const CACHED_TEACHERS_KEY = 'school_cached_teachers_v1';
const CACHED_SETTINGS_KEY = 'school_cached_settings_v1';
const CACHED_RECORDS_KEY = 'school_cached_records_v1';

export interface OfflineSyncResult {
  syncedCount: number;
  remainingCount: number;
  success: boolean;
  errors?: string[];
}

/**
 * Get all records stored locally that are awaiting synchronization.
 */
export function getOfflineQueue(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read offline queue from localStorage', err);
    return [];
  }
}

/**
 * Add an attendance record to the offline queue and save to localStorage.
 */
export function addToOfflineQueue(record: AttendanceRecord): void {
  try {
    const queue = getOfflineQueue();
    // Prevent duplicate entries for same teacher on same date in offline queue
    const filtered = queue.filter(
      (r) => !(r.teacherId === record.teacherId && r.date === record.date)
    );
    filtered.push({
      ...record,
      isOfflineRecord: true,
    });
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(filtered));

    // Also update cached records so UI reflects it immediately
    saveRecordToLocalCache(record);
  } catch (err) {
    console.error('Failed to add record to offline queue', err);
  }
}

/**
 * Remove a specific record from the offline queue.
 */
export function removeFromOfflineQueue(recordId: string): void {
  try {
    const queue = getOfflineQueue();
    const updated = queue.filter((r) => r.id !== recordId);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to remove from offline queue', err);
  }
}

/**
 * Clear the offline queue.
 */
export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear offline queue', err);
  }
}

/**
 * Cache teachers data for offline login & validation.
 */
export function cacheTeachersForOffline(teachers: Teacher[]): void {
  try {
    if (teachers && teachers.length > 0) {
      localStorage.setItem(CACHED_TEACHERS_KEY, JSON.stringify(teachers));
    }
  } catch (err) {
    console.warn('Failed to cache teachers', err);
  }
}

export function getCachedTeachers(): Teacher[] | null {
  try {
    const raw = localStorage.getItem(CACHED_TEACHERS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Cache settings for offline geofence / school info.
 */
export function cacheSettingsForOffline(settings: GeofenceSettings): void {
  try {
    if (settings) {
      localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch (err) {
    console.warn('Failed to cache settings', err);
  }
}

export function getCachedSettings(): GeofenceSettings | null {
  try {
    const raw = localStorage.getItem(CACHED_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Cache attendance records for offline viewing.
 */
export function cacheAttendanceRecords(records: AttendanceRecord[]): void {
  try {
    if (records) {
      localStorage.setItem(CACHED_RECORDS_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.warn('Failed to cache records', err);
  }
}

export function getCachedRecords(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(CACHED_RECORDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveRecordToLocalCache(record: AttendanceRecord): void {
  try {
    const cached = getCachedRecords();
    const filtered = cached.filter(
      (r) => !(r.teacherId === record.teacherId && r.date === record.date)
    );
    filtered.unshift(record);
    localStorage.setItem(CACHED_RECORDS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to update local cache', err);
  }
}

/**
 * Process all pending offline records and synchronize them with server.
 */
export async function syncPendingOfflineRecords(
  syncHandler: (record: AttendanceRecord) => Promise<{ success: boolean; error?: string }>
): Promise<OfflineSyncResult> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, remainingCount: 0, success: true };
  }

  let syncedCount = 0;
  const errors: string[] = [];

  for (const item of queue) {
    try {
      const res = await syncHandler(item);
      if (res.success) {
        removeFromOfflineQueue(item.id);
        syncedCount++;
      } else {
        errors.push(`${item.teacherName}: ${res.error || 'فشلت المزامنة'}`);
      }
    } catch (err: any) {
      errors.push(`${item.teacherName}: ${err.message || 'خطأ في الاتصال'}`);
    }
  }

  const remaining = getOfflineQueue().length;
  return {
    syncedCount,
    remainingCount: remaining,
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
