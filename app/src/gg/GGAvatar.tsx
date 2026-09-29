// ВНИМАНИЕ: копия GG/shared/GGAvatar.tsx. Не редактируй здесь -
// правь в хабе и раскатывай: node scripts/sync-avatar-sdk.mjs <папка игры>
// Аватар игрока в интерфейсе игры (React-половина Avatar SDK).
//
// Ставится ровно туда, где игра уже рисует кружок игрока:
//
//   <div className="av"><GGAvatar id={p.id} fallback={<>{faceFor(p.id)}</>} /></div>
//
// `id` - идентификатор места из комнаты. В шаблонных играх это `u<tgId>`, то
// есть Telegram id игрока уже лежит в DTO и сервер трогать не надо. Всё, что
// на него не похоже (бот, «быстрая» комната, где id намеренно обезличен),
// отдаёт fallback - игра выглядит ровно как до интеграции.
//
// Запросы батчатся: лобби на шестерых - ОДИН вызов /api/sdk/looks, а не шесть.
import { useEffect, useReducer } from 'react'
import {
  GG_HUB_DEFAULT, ggAvatarImage, ggAvatarManifest, ggLastLook, ggLaunchToken, ggLooks, lookHash,
  type AvatarLook, type AvatarManifest,
} from './avatarRender'

// ─── Общий кеш на всё приложение ───────────────────────────────────────────

let hub = GG_HUB_DEFAULT
let manifest: Promise<AvatarManifest | null> | null = null
const looks = new Map<number, AvatarLook | null>()   // null - спросили, образа нет
const urls = new Map<string, string>()               // `lookHash:size` → data-URL
const listeners = new Set<() => void>()
let queue = new Set<number>()
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Переопределить хаб (стенд, локальная разработка). Звать НЕ обязательно:
 * по умолчанию берётся боевой адрес, поэтому интеграция игры - это ровно одна
 * вставка <GGAvatar/> в разметку, без проводки и настроек.
 */
export function ggAvatarSetup(hubUrl: string): void {
  hub = hubUrl.replace(/\/$/, '')
  manifest = ggAvatarManifest(hub)
}

function boot(): void {
  manifest ??= ggAvatarManifest(hub)
  if (typeof document !== 'undefined' && !refreshBound) {
    refreshBound = true
    // Игрок переоделся в хабе и вернулся - перечитываем разом всех, кого уже
    // показывали. Один запрос на возврат фокуса, не таймер. Старые образы
    // остаются на экране, пока не приедут новые: хаб не ответил (или токен
    // запуска истёк) - лобби не проваливается обратно в эмодзи.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      for (const uid of looks.keys()) queue.add(uid)
      schedule(true)
    })
  }
}
let refreshBound = false

/** `u123456` или 123456 → Telegram id. Всё остальное → null. */
export function ggUid(id: string | number | null | undefined): number | null {
  if (typeof id === 'number') return Number.isInteger(id) && id > 0 ? id : null
  const m = typeof id === 'string' ? /^u(\d{3,})$/.exec(id) : null
  return m ? Number(m[1]) : null
}

function notify(): void { for (const l of listeners) l() }

/** Хаб не дал образ: своё место всё равно в своём образе (последний известный). */
function settle(uid: number, got: AvatarLook | undefined, keep: boolean): void {
  if (got) { looks.set(uid, got); return }
  if (keep && looks.get(uid)) return
  const last = ggLastLook()
  looks.set(uid, last && last.tg === uid ? last.look : null)
}

function schedule(refresh = false): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    const batch = [...queue]
    queue = new Set()
    if (!batch.length || !hub) return
    const token = ggLaunchToken()
    if (!token) { for (const uid of batch) settle(uid, undefined, refresh); notify(); return }
    void ggLooks(hub, token, batch).then(got => {
      for (const uid of batch) settle(uid, got[uid], refresh)
      notify()
    }).catch(() => { for (const uid of batch) settle(uid, undefined, refresh); notify() })
  }, 40)   // лобби успевает смонтировать все места - уходит один запрос
}

function want(uid: number): void {
  boot()
  if (looks.has(uid) || queue.has(uid)) return
  queue.add(uid)
  schedule()
}

function paint(look: AvatarLook, size: number): string | undefined {
  const key = `${lookHash(look)}:${size}`
  if (urls.has(key)) return urls.get(key) || undefined
  urls.set(key, '')                       // занимаем ключ, чтобы не печь дважды
  if (!manifest) return undefined
  void manifest.then(m => {
    if (!m) return
    return ggAvatarImage(m, look, { size }).then(img => {
      if (!img) return
      urls.set(key, img.src)
      notify()
    })
  }).catch(() => {})
  return undefined
}

// ─── Компонент ─────────────────────────────────────────────────────────────

export interface GGAvatarProps {
  /** Идентификатор места (`u<tgId>`) или сам Telegram id. */
  id?: string | number | null
  /** Что рисовать, пока образа нет или его не будет: эмодзи, инициал, что угодно. */
  fallback?: React.ReactNode
  /** Сторона картинки в пикселях. По умолчанию 64 - хватает кружку 40px на 2x. */
  size?: number
}

export function GGAvatar({ id, fallback = null, size = 64 }: GGAvatarProps) {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const uid = ggUid(id)

  useEffect(() => {
    listeners.add(bump)
    return () => { listeners.delete(bump) }
  }, [])

  useEffect(() => { if (uid) want(uid) }, [uid])

  if (!uid) return <>{fallback}</>
  const look = looks.get(uid)
  const url = look ? paint(look, size) : undefined
  if (!url) return <>{fallback}</>
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  )
}
