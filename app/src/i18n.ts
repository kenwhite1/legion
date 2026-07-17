import { useSyncExternalStore } from 'react'
import { EN } from './strings'
import { launchLang } from '@shared/gg'
export type Lang = 'ru' | 'en'
const KEY = 'gg_lang'
let currentLang: Lang = 'ru'
const listeners = new Set<() => void>()
export function detectLang(): Lang {
  const hub = launchLang((window as any).Telegram?.WebApp?.initDataUnsafe?.start_param)
  if (hub) { try { localStorage.setItem(KEY, hub) } catch {} ; return hub }
  try { const s = localStorage.getItem(KEY); if (s === 'ru' || s === 'en') return s } catch {}
  const code = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code
  if (code) return String(code).toLowerCase().startsWith('ru') ? 'ru' : 'en'
  return 'ru'
}
export function initLang(): void { currentLang = detectLang() }
export function getLang(): Lang { return currentLang }
export function setLang(l: Lang): void {
  if (l === currentLang) return
  currentLang = l
  try { localStorage.setItem(KEY, l) } catch {}
  listeners.forEach(fn => fn())
}
export function toggleLang(): Lang { const n: Lang = currentLang === 'ru' ? 'en' : 'ru'; setLang(n); return n }
export function onLangChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn) } }
export function t(ru: string): string { return currentLang === 'ru' ? ru : (EN[ru] ?? ru) }
export function numLocale(): string { return currentLang === 'ru' ? 'ru' : 'en-US' }
export function useLang(): Lang {
  return useSyncExternalStore(cb => onLangChange(cb), () => currentLang, () => currentLang)
}
