export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) return reject(new Error('Geolocation not available'));
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), { enableHighAccuracy: true, timeout: 10000 });
  });
}

export function watchPosition(onUpdate: (pos: GeolocationPosition) => void) {
  if (!navigator?.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => onUpdate(p),
    () => undefined,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
