export const APP_VERSION = '2.7.3';

// Cache del resultado: el chequeo corre en CADA sincronización (o sea, en cada
// alta/edición/borrado de un parte) y no tiene sentido pegarle al servidor con
// un fetch no-store cada vez. Se revalida como mucho cada 5 minutos.
const VERSION_CHECK_TTL_MS = 5 * 60 * 1000;
let cachedCheck: { at: number; result: { isUpdated: boolean; serverVersion: string | null } } | null = null;

export async function checkAppVersion(): Promise<{ isUpdated: boolean; serverVersion: string | null }> {
  if (cachedCheck && Date.now() - cachedCheck.at < VERSION_CHECK_TTL_MS) {
    return cachedCheck.result;
  }
  const result = await doCheckAppVersion();
  cachedCheck = { at: Date.now(), result };
  return result;
}

async function doCheckAppVersion(): Promise<{ isUpdated: boolean; serverVersion: string | null }> {
  try {
    // Add a cache buster timestamp to ensure we get the latest file
    const response = await fetch(`version.json?t=${new Date().getTime()}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      console.warn('Could not fetch version.json, assuming up to date.');
      return { isUpdated: true, serverVersion: null };
    }

    const data = await response.json();
    const serverVersion = data.version;

    if (serverVersion && serverVersion !== APP_VERSION) {
      console.warn(`Version mismatch! App: ${APP_VERSION}, Server: ${serverVersion}`);
      return { isUpdated: false, serverVersion };
    }

    return { isUpdated: true, serverVersion };
  } catch (error) {
    console.error('Error checking app version:', error);
    // If offline or error, assume it's updated to not block the app completely
    return { isUpdated: true, serverVersion: null };
  }
}
