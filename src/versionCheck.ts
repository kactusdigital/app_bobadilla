export const APP_VERSION = '2.7.1';

export async function checkAppVersion(): Promise<{ isUpdated: boolean; serverVersion: string | null }> {
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
