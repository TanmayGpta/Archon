
/* -- Last opened folder, remembered per browser so a refresh reopens it - */
export const LAST_PROJECT_KEY = 'archon.ide.lastProject';

export function readLastProject(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || '';
  } catch {
    return '';
  }
}

export function writeLastProject(path: string) {
  try {
    if (path) localStorage.setItem(LAST_PROJECT_KEY, path);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {}
}
