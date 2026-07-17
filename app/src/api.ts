import { getInitData } from './telegram'
import type { Profile, RoomStateDto } from '@shared/types'
import type { Action } from '@shared/engine'
import type { Difficulty } from '@shared/bots'

let token: string | null = sessionStorage.getItem('lg_jwt')

async function req<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error ?? 'request_failed'), { status: res.status, data: json })
  return json as T
}

export interface LeaderRow { name: string; wins: number; played: number }

export const api = {
  async auth(): Promise<{ profile: Profile; startParam: string | null; botUsername: string }> {
    const r = await req<{ token: string; profile: Profile; startParam: string | null; botUsername: string }>('/auth', {
      initData: getInitData(),
    })
    token = r.token
    sessionStorage.setItem('lg_jwt', r.token)
    return { profile: r.profile, startParam: r.startParam, botUsername: r.botUsername }
  },
  profile: () => req<{ profile: Profile }>('/profile'),
  leaderboard: () => req<{ top: LeaderRow[] }>('/leaderboard'),
  soloResult: (won: boolean, score: number, runId: string) =>
    req<{ profile: Profile }>('/solo/result', { won, score, runId }),
  roomCreate: (difficulty: Difficulty) => req<RoomStateDto>('/room/create', { difficulty }),
  roomQuick: () => req<RoomStateDto>('/room/quick', {}),
  roomJoin: (code: string) => req<RoomStateDto>('/room/join', { code }),
  roomState: (code: string) => req<RoomStateDto>(`/room/${code}`),
  roomStart: (code: string) => req<RoomStateDto>(`/room/${code}/start`, {}),
  roomAction: (code: string, action: Action) => req<RoomStateDto>(`/room/${code}/action`, { action }),
  roomLeave: (code: string) => req<{ ok: boolean }>(`/room/${code}/leave`, {}),
}
