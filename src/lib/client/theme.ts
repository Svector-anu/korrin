export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'korrin:theme'

/** Runs before first paint, so the stored or system theme is applied with no flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePreference=p}catch(e){document.documentElement.dataset.theme='light'}})()`

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(preference)
  root.dataset.themePreference = preference
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage can be unavailable in private windows; the theme still applies for this page.
  }
}
