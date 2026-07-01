import { db } from './db'
import type { Profile } from '../../shared/types'

interface UserRow {
  id: number
  name: string
  username: string | null
  wins: number
  losses: number
  played: number
  streak: number
  best_streak: number
  coins: number
}

export function getOrCreateUser(id: number, name: string, username?: string): UserRow {
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined
  if (existing) {
    db.prepare('UPDATE users SET name=?, last_seen=datetime(\'now\') WHERE id=?').run(name, id)
    return { ...existing, name }
  }
  db.prepare('INSERT INTO users (id, name, username, last_seen) VALUES (?,?,?,datetime(\'now\'))').run(
    id,
    name,
    username ?? null,
  )
  return db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow
}

export function toProfile(u: UserRow): Profile {
  return {
    id: u.id,
    name: u.name,
    wins: u.wins,
    losses: u.losses,
    played: u.played,
    streak: u.streak,
    bestStreak: u.best_streak,
    coins: u.coins,
  }
}

export function getProfile(id: number): Profile | null {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined
  return u ? toProfile(u) : null
}

const WIN_COINS = 25
const PLAY_COINS = 5

export function recordResult(id: number, mode: 'solo' | 'online', won: boolean, score: number): Profile {
  // ensure the row exists WITHOUT clobbering an existing display name
  db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Player')").run(id)
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow
  const streak = won ? u.streak + 1 : 0
  const best = Math.max(u.best_streak, streak)
  const coins = u.coins + PLAY_COINS + (won ? WIN_COINS + score : 0)
  db.prepare(
    `UPDATE users SET played=played+1, wins=wins+?, losses=losses+?, streak=?, best_streak=?, coins=? WHERE id=?`,
  ).run(won ? 1 : 0, won ? 0 : 1, streak, best, coins, id)
  db.prepare('INSERT INTO results (user_id, mode, won, score) VALUES (?,?,?,?)').run(
    id,
    mode,
    won ? 1 : 0,
    score,
  )
  return getProfile(id)!
}

export interface LeaderRow {
  name: string
  wins: number
  played: number
}

export function topPlayers(limit = 20): LeaderRow[] {
  return db
    .prepare('SELECT name, wins, played FROM users WHERE played > 0 ORDER BY wins DESC, played ASC LIMIT ?')
    .all(limit) as LeaderRow[]
}
