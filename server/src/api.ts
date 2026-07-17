import { Hono } from 'hono'
import { z } from 'zod'
import { validateInitData, issueToken, verifyToken } from './auth'
import type { Env } from './env'
import { getOrCreateUser, getProfile, recordResult, topPlayers } from './profiles'
import { storeLaunchToken, reportMatch, withHubCoins } from './gg'
import { createRoom, joinRoom, quickMatch, startRoom, actInRoom, getRoomState, leaveRoom } from './rooms'
import { BOT_USERNAME } from './env'
import type { Action } from '../../shared/engine'
import type { Difficulty } from '../../shared/bots'

export const api = new Hono<Env>()

api.get('/health', c => c.json({ ok: true }))

api.post('/auth', async c => {
  const body = await c.req.json<{ initData: string }>().catch(() => null)
  if (!body) return c.json({ error: 'bad_request' }, 400)
  const v = validateInitData(body.initData ?? '')
  if (!v) return c.json({ error: 'invalid_init_data' }, 401)
  const name = [v.user.first_name, v.user.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок'
  getOrCreateUser(v.user.id, name, v.user.username)
  // Открыли из хаба GG - в startapp приехал токен запуска, он нужен в конце партии.
  storeLaunchToken(v.user.id, v.startParam)
  const token = await issueToken(v.user.id)
  const profile = await withHubCoins(v.user.id, getProfile(v.user.id))
  return c.json({ token, profile, startParam: v.startParam, botUsername: BOT_USERNAME })
})

// защита авторизацией для всего ниже
api.use('/*', async (c, next) => {
  if (c.req.path.endsWith('/auth') || c.req.path.endsWith('/health')) return next()
  const token = c.req.header('authorization')?.replace(/^Bearer /, '')
  const uid = token ? await verifyToken(token) : null
  if (!uid) return c.json({ error: 'unauthorized' }, 401)
  c.set('uid', uid)
  return next()
})

api.get('/profile', async c => c.json({ profile: await withHubCoins(c.get('uid'), getProfile(c.get('uid'))) }))

api.get('/leaderboard', c => c.json({ top: topPlayers(20) }))

// фиксируем завершённую одиночную партию (движок крутится на клиенте, сервер
// лишь ведёт статистику)
api.post('/solo/result', async c => {
  const body = await c.req.json<{ won: boolean; score: number; runId?: string }>().catch(() => null)
  if (!body) return c.json({ error: 'bad_request' }, 400)
  const score = Math.max(0, Math.min(20, body.score | 0))
  const profile = recordResult(c.get('uid'), 'solo', !!body.won, score)
  // Рапорт хабу. runId клиент заводит на старте забега, поэтому ключ уникален
  // для каждой соло-партии и стабилен при повторе. Без него не рапортуем:
  // выдуманный на сервере ключ на ретрае доплатил бы второй раз.
  if (typeof body.runId === 'string' && /^[a-z0-9]{1,32}$/.test(body.runId)) {
    reportMatch({
      userId: c.get('uid'),
      idempotencyKey: `legion-solo-${body.runId}-${c.get('uid')}`,
      won: !!body.won,
      humanPlayers: 1,
      score,
      mode: 'solo',
      opponents: [],
    })
  }
  return c.json({ profile })
})

// ── онлайн-комнаты ───────────────────────────────────────────────────────────
const idSchema = z.string().max(8)
const actionSchema: z.ZodType<Action> = z.union([
  z.object({ type: z.literal('place'), playerId: z.string(), territoryId: idSchema, count: z.number().int() }),
  z.object({ type: z.literal('attack'), playerId: z.string(), from: idSchema, to: idSchema }),
  z.object({ type: z.literal('advance'), playerId: z.string(), count: z.number().int() }),
  z.object({ type: z.literal('endAttack'), playerId: z.string() }),
  z.object({ type: z.literal('fortify'), playerId: z.string(), from: idSchema, to: idSchema, count: z.number().int() }),
  z.object({ type: z.literal('endTurn'), playerId: z.string() }),
]) as z.ZodType<Action>

const diffSchema = z.enum(['easy', 'medium', 'hard'])
const nameOf = (uid: number) => getProfile(uid)?.name ?? 'Игрок'

api.post('/room/create', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ difficulty?: Difficulty }>().catch(() => null)
  const diff = diffSchema.safeParse(body?.difficulty)
  return c.json(createRoom(uid, nameOf(uid), diff.success ? diff.data : 'medium'))
})

api.post('/room/join', async c => {
  const uid = c.get('uid')
  const body = await c.req.json<{ code: string }>().catch(() => null)
  const code = (body?.code ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(code)) return c.json({ error: 'bad_code' }, 400)
  const r = joinRoom(code, uid, nameOf(uid))
  if ('error' in r) return c.json(r, 400)
  return c.json(r)
})

api.post('/room/quick', c => {
  const uid = c.get('uid')
  return c.json(quickMatch(uid, nameOf(uid)))
})

api.get('/room/:code', c => {
  const r = getRoomState(c.req.param('code'), c.get('uid'))
  if ('error' in r) return c.json(r, 404)
  return c.json(r)
})

api.post('/room/:code/start', c => {
  const r = startRoom(c.req.param('code'), c.get('uid'))
  if ('error' in r) return c.json(r, 400)
  return c.json(r)
})

api.post('/room/:code/action', async c => {
  const body = await c.req.json().catch(() => null)
  const parsed = actionSchema.safeParse(body?.action)
  if (!parsed.success) return c.json({ error: 'bad_action' }, 400)
  const r = actInRoom(c.req.param('code'), c.get('uid'), parsed.data)
  if ('error' in r) return c.json(r, 400)
  return c.json(r)
})

api.post('/room/:code/leave', c => {
  leaveRoom(c.req.param('code'), c.get('uid'))
  return c.json({ ok: true })
})
