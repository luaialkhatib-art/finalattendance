import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { AttendanceRecord, GeofenceSettings, NotificationItem, Teacher } from './types.ts';

// Firebase configuration for project: molten-keep-wbcxw
export const FIREBASE_CONFIG = {
  projectId: "molten-keep-wbcxw",
  appId: "1:1066300203283:web:537912e197c533814d7ae6",
  apiKey: "AIzaSyB0eVRWUr7ipLYPuA7XRXHgI5DoCjFDMOk",
  authDomain: "molten-keep-wbcxw.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-25cbbe99-2f6f-40b1-b171-05d1ce8dd116",
  storageBucket: "molten-keep-wbcxw.firebasestorage.app",
  messagingSenderId: "1066300203283",
  measurementId: "",
  oAuthClientId: "1066300203283-b7hosool7srvjvsn3bnf67ohlnq3vnq8.apps.googleusercontent.com",
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);

// Initialize Cloud Firestore with offline persistence
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    FIREBASE_CONFIG.firestoreDatabaseId
  );
} catch (err) {
  console.warn('Persistent local cache fallback:', err);
  firestoreInstance = getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId);
}

export const db = firestoreInstance;

// Firestore Collections
const ATTENDANCE_COLLECTION = 'attendance';
const NOTIFICATIONS_COLLECTION = 'notifications';
const TEACHERS_COLLECTION = 'teachers';
const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOC_ID = 'school_settings';

/**
 * Real-time listener for attendance records across all school devices.
 */
export function subscribeAttendance(
  onUpdate: (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, ATTENDANCE_COLLECTION);
  const q = query(collRef, orderBy('timestamp', 'desc'), limit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: AttendanceRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as AttendanceRecord);
      });
      onUpdate(records);
    },
    (error) => {
      console.warn('Firestore attendance subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Real-time listener for school notifications for the principal and staff.
 */
export function subscribeNotifications(
  onUpdate: (notifications: NotificationItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, NOTIFICATIONS_COLLECTION);
  const q = query(collRef, orderBy('timestamp', 'desc'), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: NotificationItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as NotificationItem);
      });
      onUpdate(items);
    },
    (error) => {
      console.warn('Firestore notifications subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Real-time listener for teachers list.
 */
export function subscribeTeachers(
  onUpdate: (teachers: Teacher[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collRef = collection(db, TEACHERS_COLLECTION);

  return onSnapshot(
    collRef,
    (snapshot) => {
      if (!snapshot.empty) {
        const list: Teacher[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as Teacher);
        });
        onUpdate(list);
      }
    },
    (error) => {
      console.warn('Firestore teachers subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Real-time listener for geofence & school settings.
 */
export function subscribeSettings(
  onUpdate: (settings: GeofenceSettings) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as GeofenceSettings);
      }
    },
    (error) => {
      console.warn('Firestore settings subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Save an attendance record to Firestore cloud.
 * Document ID format: {date}_{teacherId} to ensure one official record per teacher per day.
 */
export async function saveAttendanceToFirebase(record: AttendanceRecord): Promise<void> {
  const docId = `${record.date}_${record.teacherId}`;
  const docRef = doc(db, ATTENDANCE_COLLECTION, docId);
  const recordToSave = {
    ...record,
    id: docId,
    syncedAt: Date.now(),
  };
  await setDoc(docRef, recordToSave, { merge: true });
}

/**
 * Delete an attendance record from Firestore.
 */
export async function deleteAttendanceFromFirebase(recordId: string): Promise<void> {
  const docRef = doc(db, ATTENDANCE_COLLECTION, recordId);
  await deleteDoc(docRef);
}

/**
 * Add an in-app notification to Firestore.
 */
export async function saveNotificationToFirebase(notification: NotificationItem): Promise<void> {
  const docRef = doc(db, NOTIFICATIONS_COLLECTION, notification.id);
  await setDoc(docRef, notification);
}

/**
 * Mark all notifications as read in Firestore.
 */
export async function markAllNotificationsReadInFirebase(): Promise<void> {
  const collRef = collection(db, NOTIFICATIONS_COLLECTION);
  const snap = await getDocs(query(collRef, limit(100)));
  const batch = writeBatch(db);

  snap.forEach((d) => {
    if (!d.data().read) {
      batch.update(d.ref, { read: true });
    }
  });

  await batch.commit();
}

/**
 * Save / Update a teacher in Firestore.
 */
export async function saveTeacherToFirebase(teacher: Teacher): Promise<void> {
  const docRef = doc(db, TEACHERS_COLLECTION, teacher.id);
  await setDoc(docRef, teacher, { merge: true });
}

/**
 * Delete a teacher from Firestore.
 */
export async function deleteTeacherFromFirebase(teacherId: string): Promise<void> {
  const docRef = doc(db, TEACHERS_COLLECTION, teacherId);
  await deleteDoc(docRef);
}

/**
 * Save geofence and school settings to Firestore.
 */
export async function saveSettingsToFirebase(settings: GeofenceSettings): Promise<void> {
  const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  await setDoc(docRef, settings, { merge: true });
}

/**
 * Initial cloud seed: If Firestore is empty, seed initial teachers and school settings.
 */
export async function seedInitialFirestoreData(
  initialTeachers: Teacher[],
  initialSettings: GeofenceSettings
): Promise<void> {
  try {
    // Check settings
    const settingsDocRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const settingsSnap = await getDoc(settingsDocRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsDocRef, initialSettings);
    }

    // Check teachers
    const teachersCol = collection(db, TEACHERS_COLLECTION);
    const teachersSnap = await getDocs(query(teachersCol, limit(1)));
    if (teachersSnap.empty) {
      const batch = writeBatch(db);
      for (const t of initialTeachers) {
        const tRef = doc(db, TEACHERS_COLLECTION, t.id);
        batch.set(tRef, t);
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('Firebase initial seed check:', err);
  }
}
