// Интеграция с хабом Game is Game: игра рапортует исход матча, хаб решает
// награду. Всё fire-and-forget - хаб недоступен, легион живёт дальше.
import { db } from './db'
import { ggReport, ggBalance, decodeLaunchParam, type MatchMode } from '../../shared/gg'
import type { Profile } from '../../shared/types'

const HUB_URL = (process.env.GG_HUB_URL ?? 'https://game-is-game-hub-production.up.railway.app').replace(/\/$/, '')

/** Токен запуска приезжает в startapp; храним его до конца партии. */
export function storeLaunchToken(userId: number, startParam: string | null | undefined): void {
  const token = decodeLaunchParam(startParam ?? undefined)
  if (!token) return
  db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(userId)
  db.prepare('UPDATE users SET gg_launch=? WHERE id=?').run(token, userId)
}

function launchTokenOf(userId: number): string | null {
  const row = db.prepare('SELECT gg_launch FROM users WHERE id=?').get(userId) as
    | { gg_launch: string | null }
    | undefined
  return row?.gg_launch ?? null
}

export interface MatchFacts {
  userId: number
  /** Уникален для пары «партия + игрок»: хаб дедупит выплату по нему. */
  idempotencyKey: string
  won: boolean
  /** Размер лобби; в соло сервер его не знает - тогда не шлём. */
  players?: number
  humanPlayers: number
  score: number
  mode: MatchMode
  opponents: number[]
  /** Флаги игровых достижений - только те, что игра реально может доказать. */
  stats?: Record<string, number | boolean>
}

/** Один вызов на конец партии для каждого живого игрока. */
export function reportMatch(f: MatchFacts): void {
  if (!HUB_URL) return
  const token = launchTokenOf(f.userId)
  // Игрок пришёл в бота напрямую, а не из хаба - рапортовать не от чьего имени.
  if (!token) return
  void ggReport(HUB_URL, token, {
    idempotencyKey: f.idempotencyKey,
    result: f.won ? 'win' : 'loss',
    players: f.players,
    humanPlayers: f.humanPlayers,
    score: f.score,
    mode: f.mode,
    opponents: f.opponents,
    stats: f.stats,
  }).catch(() => {})
}


/**
 * Баланс единой валюты G для игрока, если он запущен из хаба. null - когда игра
 * standalone (нет токена), хаб не настроен или запрос не удался; тогда вызвавший
 * оставляет локальный счётчик как офлайн-фолбэк. Не бросает.
 */
export async function hubCoins(userId: number): Promise<number | null> {
  if (!HUB_URL) return null
  const token = launchTokenOf(userId)
  if (!token) return null
  try {
    const r = await ggBalance(HUB_URL, token)
    return r.ok ? r.coins : null
  } catch {
    return null
  }
}

/** Профиль с балансом хаба поверх локального `coins`, если он доступен. */
export async function withHubCoins(userId: number, profile: Profile | null): Promise<Profile | null> {
  if (!profile) return profile
  const coins = await hubCoins(userId)
  return coins == null ? profile : { ...profile, coins }
}

/** Язык хаба для игрока: клейм `lng` из сохранённого токена запуска.
 *  Нужен серверу, чтобы подобрать соперникам имена на языке игрока. */
export function userLang(userId: number | null | undefined): 'ru' | 'en' {
  if (userId == null) return 'ru'
  const token = launchTokenOf(userId)
  if (!token) return 'ru'
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    )
    return payload.lng === 'en' ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

// ─── Друзья из хаба (§экосистема) ───────────────────────────────────────────
// Друзей заводят один раз в хабе, а зовут из любой игры. Хаб отдаёт список и
// сам рассылает приглашения на языке получателя, поэтому игре не нужны ни свой
// граф друзей, ни свой бот. Ходим через сервер: токен запуска лежит здесь, а на
// хабе нет CORS для браузера.

export interface HubPerson { id: number; name: string; color: string; face: string }

async function hubCall(path: string, token: string, body?: unknown): Promise<any | null> {
  try {
    const res = await fetch(`${HUB_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-gg-launch': token },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => null)
    return res.ok ? json : null
  } catch {
    return null
  }
}

/** Друзья игрока в хабе. Пустой список - запуск не из хаба или хаб недоступен. */
export async function hubFriends(userId: number): Promise<HubPerson[]> {
  const token = launchTokenOf(userId)
  if (!token) return []
  const r = (await hubCall('/api/sdk/friends', token)) as { ok: boolean; friends: HubPerson[] } | null
  return r?.ok ? r.friends : []
}

/** Позвать друзей из хаба в эту игру. Возвращает, скольким сообщение ушло. */
export async function inviteHubFriends(userId: number, friendIds: number[], note?: string): Promise<number> {
  const token = launchTokenOf(userId)
  if (!token || friendIds.length === 0) return 0
  const r = (await hubCall('/api/sdk/invite', token, { friendIds, note })) as { ok: boolean; sent: number } | null
  return r?.ok ? r.sent : 0
}
