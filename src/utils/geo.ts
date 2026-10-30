// Haversine formula to calculate the distance between two coordinates in meters
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
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

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function getCurrentCoordinates(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('خدمة تحديد الموقع الجغرافي (GPS) غير مدعومة في هذا المتصفح'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        let message = 'تعذر الحصول على الموقع الجغرافي.';
        if (err.code === err.PERMISSION_DENIED) {
          message = 'يرجى السماح للتطبيق بالوصول إلى موقعك الجغرافي (GPS) لتسجيل الحضور.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = 'معلومات الموقع الجغرافي غير متوفرة حالياً.';
        } else if (err.code === err.TIMEOUT) {
          message = 'انتهت مهلة الحصول على الموقع الجغرافي.';
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }
    );
  });
}
