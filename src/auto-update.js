import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export const checkForUpdates = async () => {
  try {
    const update = await check();
    return update; // Returns update object or null
  } catch (error) {
    console.error('Failed to check for updates:', error);
    throw error;
  }
};

export const downloadAndInstallUpdate = async (updateState, onProgress) => {
  try {
    if (!updateState || !updateState.update) {
      throw new Error('No update payload available');
    }

    let finished = false;

    await updateState.update.downloadAndInstall(event => {
      if (onProgress) {
        onProgress(event);
      }

      if (event?.event === 'Finished') {
        finished = true;
      }
    });

    return { finished };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown update error';
    throw new Error(message);
  }
};

export const relaunchApp = async () => {
  try {
    await relaunch();
  } catch (err) {
    console.error('Failed to relaunch:', err);
    throw err;
  }
};
