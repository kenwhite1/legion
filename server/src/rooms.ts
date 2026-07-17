// --- Менеджер онлайн-комнат --------------------------------------------------
// Партии авторитетно живут в памяти сервера (один инстанс на Railway). Одиночная
// игра целиком на клиенте и всего этого не требует; комнаты добавляют социальный
// слой «играй с друзьями», ради которого это настоящее мини-приложение.
//
// Два вида комнат:
//   * дружеские  - по коду; пустые места занимают (видимые) боты, старт по кнопке хозяина;
//   * быстрые    - публичный подбор; автостарт и добор ботами, которых клиенту
//                  показывают как обычных игроков.

import {
  createGame,
  applyAction,
  territoryCount,
  type GameState,
  type Action,
} from '../../shared/engine'
import { botDecide, type Difficulty } from '../../shared/bots'
import { toView } from '../../shared/view'
import type { RoomStateDto, RoomDto } from '../../shared/types'
import { recordResult } from './profiles'
import { reportMatch } from './gg'
import type { MatchMode } from '../../shared/gg'

interface Seat {
  id: string // id игрока движка: 'u<tgid>' для людей, 'bot1'… для ботов
  tgId: number | null
  name: string
  isBot: boolean
  isHost: boolean
  lastSeen: number
  difficulty: Difficulty
}

interface Room {
  code: string
  hostTgId: number
  seats: Seat[]
  game: GameState | null
  version: number
  maxPlayers: number
  createdAt: number
  lastActivity: number
  scored: boolean
  roundOver: { winnerName: string } | null
  quick: boolean
  difficulty: Difficulty // сложность добираемых ботов в дружеской комнате
  startTimer: ReturnType<typeof setTimeout> | null
}

const rooms = new Map<string, Room>()
const MAX = 4
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без легко путаемых символов
const QUICK_DELAY = 6000 // окно подбора до автостарта быстрой партии

const BOT_NAMES = ['Аскольд', 'Борислав', 'Всеволод', 'Гордей', 'Драгомир', 'Ждан']
const HUMAN_NAMES = [
  'Максим', 'Лена', 'Дима', 'Соня', 'Костя', 'Вера', 'Паша', 'Юля',
  'Олег', 'Катя', 'Рома', 'Настя', 'Игорь', 'Маша', 'Артём', 'Поля',
]

function newCode(): string {
  let code = ''
  do {
    code = ''
    for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  } while (rooms.has(code))
  return code
}

function seatFor(room: Room, tgId: number): Seat | undefined {
  return room.seats.find(s => s.tgId === tgId)
}

function pickQuickDiff(): Difficulty {
  const r = Math.random()
  return r < 0.25 ? 'easy' : r < 0.8 ? 'medium' : 'hard'
}

// Добираем стол ботами. В быстрых комнатах - человеческие имена и разная
// сложность, чтобы соперники читались как живые; в дружеских - по выбору хозяина.
function fillBots(room: Room): void {
  const used = new Set(room.seats.map(s => s.name))
  const pool = room.quick ? HUMAN_NAMES : BOT_NAMES
  let b = room.seats.filter(s => s.isBot).length + 1
  let pi = Math.floor(Math.random() * pool.length)
  while (room.seats.length < room.maxPlayers) {
    let nm = pool[pi % pool.length]
    let tries = 0
    while (used.has(nm) && tries++ < pool.length) nm = pool[++pi % pool.length]
    used.add(nm)
    room.seats.push({
      id: `bot${b++}`,
      tgId: null,
      name: nm,
      isBot: true,
      isHost: false,
      lastSeen: Date.now(),
      difficulty: room.quick ? pickQuickDiff() : room.difficulty,
    })
    pi++
  }
}

function beginGame(room: Room): void {
  if (room.startTimer) { clearTimeout(room.startTimer); room.startTimer = null }
  fillBots(room)
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
  room.game = createGame({
    players: room.seats.map(s => ({ id: s.id, name: s.name, isBot: s.isBot })),
    seed,
  })
  room.scored = false
  room.roundOver = null
  room.version++
  room.lastActivity = Date.now()
  runBots(room)
}

function roomDto(room: Room): RoomDto {
  return {
    code: room.code,
    hostId: room.quick ? '' : `u${room.hostTgId}`,
    started: !!room.game,
    maxPlayers: room.maxPlayers,
    quick: room.quick,
    players: room.seats.map(s => ({
      id: s.id,
      name: s.name,
      // быстрые комнаты никогда не выдают, что место занял бот
      isBot: room.quick ? false : s.isBot,
      isHost: room.quick ? false : s.isHost,
      connected: s.isBot || Date.now() - s.lastSeen < 15000,
    })),
  }
}

export function createRoom(tgId: number, name: string, difficulty: Difficulty = 'medium'): RoomStateDto {
  const code = newCode()
  const room: Room = {
    code,
    hostTgId: tgId,
    seats: [{ id: `u${tgId}`, tgId, name, isBot: false, isHost: true, lastSeen: Date.now(), difficulty: 'medium' }],
    game: null,
    version: 1,
    maxPlayers: MAX,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    scored: false,
    roundOver: null,
    quick: false,
    difficulty,
    startTimer: null,
  }
  rooms.set(code, room)
  return stateFor(room, tgId)
}

export function joinRoom(code: string, tgId: number, name: string): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.game) return { error: 'already_started' }
  const existing = seatFor(room, tgId)
  if (existing) {
    existing.lastSeen = Date.now()
    return stateFor(room, tgId)
  }
  const humans = room.seats.filter(s => !s.isBot).length
  if (humans >= room.maxPlayers) return { error: 'full' }
  room.seats.push({ id: `u${tgId}`, tgId, name, isBot: false, isHost: false, lastSeen: Date.now(), difficulty: 'medium' })
  room.version++
  room.lastActivity = Date.now()
  return stateFor(room, tgId)
}

// Публичный подбор: подсаживаем в открытую быструю комнату или заводим свежую,
// которая автостартует после короткого окна (добор - замаскированные боты).
export function quickMatch(tgId: number, name: string): RoomStateDto {
  for (const room of rooms.values()) {
    if (!room.quick || room.game) continue
    if (seatFor(room, tgId)) { room.seats.find(s => s.tgId === tgId)!.lastSeen = Date.now(); return stateFor(room, tgId) }
    const humans = room.seats.filter(s => !s.isBot).length
    if (humans >= room.maxPlayers) continue
    room.seats.push({ id: `u${tgId}`, tgId, name, isBot: false, isHost: false, lastSeen: Date.now(), difficulty: 'medium' })
    room.version++
    room.lastActivity = Date.now()
    if (room.seats.filter(s => !s.isBot).length >= room.maxPlayers) beginGame(room)
    return stateFor(room, tgId)
  }
  const code = newCode()
  const room: Room = {
    code,
    hostTgId: tgId,
    seats: [{ id: `u${tgId}`, tgId, name, isBot: false, isHost: true, lastSeen: Date.now(), difficulty: 'medium' }],
    game: null,
    version: 1,
    maxPlayers: MAX,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    scored: false,
    roundOver: null,
    quick: true,
    difficulty: 'medium',
    startTimer: null,
  }
  rooms.set(code, room)
  room.startTimer = setTimeout(() => {
    const r = rooms.get(code)
    if (r && !r.game) beginGame(r)
  }, QUICK_DELAY)
  return stateFor(room, tgId)
}

export function startRoom(code: string, tgId: number): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  if (room.hostTgId !== tgId) return { error: 'not_host' }
  if (room.game) return { error: 'already_started' }
  beginGame(room)
  return stateFor(room, tgId)
}

export function actInRoom(
  code: string,
  tgId: number,
  action: Action,
): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room || !room.game) return { error: 'no_game' }
  const seat = seatFor(room, tgId)
  if (!seat) return { error: 'not_in_room' }
  // человек может действовать только за своё место
  if (action.playerId !== seat.id) return { error: 'not_your_seat' }
  seat.lastSeen = Date.now()

  const res = applyAction(room.game, action)
  if (res.error) return { error: res.error }
  room.game = res.state
  room.version++
  room.lastActivity = Date.now()
  runBots(room)
  finishIfDone(room)
  return stateFor(room, tgId)
}

// Прокручиваем все подряд идущие ходы ботов (включая обязательный ввод войск
// после захвата - botDecide сам возвращает нужное действие) до хода человека
// или конца партии.
function runBots(room: Room): void {
  let guard = 0
  while (room.game && room.game.status === 'playing' && guard++ < 4000) {
    const cur = room.game.players[room.game.turn]
    const seat = room.seats.find(s => s.id === cur.id)
    if (!seat || !seat.isBot) break
    const res = applyAction(room.game, botDecide(room.game, cur.id, seat.difficulty))
    if (res.error) break
    room.game = res.state
    room.version++
  }
  finishIfDone(room)
}

function finishIfDone(room: Room): void {
  if (!room.game || room.game.status !== 'finished' || room.scored) return
  room.scored = true
  const g = room.game
  const winner = g.players.find(p => p.id === g.winnerId)
  room.roundOver = { winnerName: winner?.name ?? '-' }
  // Живые - только настоящие люди: в быстрой комнате боты замаскированы под них
  // для UI, но хабу нужно честное число (соц./ранговые ачивки, анти-чит).
  const humans = room.seats.filter(h => !h.isBot && h.tgId != null)
  const mode: MatchMode = room.quick ? 'multi' : 'friends'
  for (const s of room.seats) {
    if (s.isBot || s.tgId == null) continue
    const won = g.winnerId === s.id
    const territories = territoryCount(g, s.id)
    recordResult(s.tgId, 'online', won, territories)
    // Рапорт хабу: room.scored выше гарантирует один раз на партию, а ключ
    // идемпотентности (код + время создания комнаты) - что повтор не доплатит.
    reportMatch({
      userId: s.tgId,
      idempotencyKey: `legion-${room.code}-${room.createdAt}-${s.tgId}`,
      won,
      players: room.seats.length,
      humanPlayers: humans.length,
      score: territories,
      mode,
      opponents: humans.filter(h => h.tgId !== s.tgId).map(h => h.tgId as number),
      // «Молния»: turnCount растёт на каждый ход игрока, так что порог из
      // SDK-PER-GAME.md проверяется напрямую. Остальные флаги легиона
      // («без потерь», «континент») движок не отслеживает - не выдумываем.
      stats: won && g.turnCount < 25 ? { fast: true } : undefined,
    })
  }
}

export function getRoomState(code: string, tgId: number): RoomStateDto | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'no_room' }
  const seat = seatFor(room, tgId)
  if (seat) seat.lastSeen = Date.now()
  return stateFor(room, tgId)
}

export function leaveRoom(code: string, tgId: number): void {
  const room = rooms.get(code.toUpperCase())
  if (!room) return
  if (!room.game) {
    room.seats = room.seats.filter(s => s.tgId !== tgId)
    if (room.seats.filter(s => !s.isBot).length === 0) {
      if (room.startTimer) clearTimeout(room.startTimer)
      rooms.delete(code.toUpperCase())
    } else room.version++
  }
}

function stateFor(room: Room, tgId: number): RoomStateDto {
  const seat = seatFor(room, tgId)
  let view = room.game && seat ? toView(room.game, seat.id) : null
  // в быстрой комнате не раскрываем, что соперники - боты
  if (view && room.quick) view = { ...view, players: view.players.map(p => ({ ...p, isBot: false })) }
  const won = room.roundOver && seat ? room.game?.winnerId === seat.id : undefined
  return {
    room: roomDto(room),
    version: room.version,
    view,
    roundOver: room.roundOver ? { winnerName: room.roundOver.winnerName, won } : null,
  }
}

// подметаем простаивающие комнаты каждые 10 минут (30 минут без активности - удаляем)
setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 30 * 60_000) {
      if (room.startTimer) clearTimeout(room.startTimer)
      rooms.delete(code)
    }
  }
}, 10 * 60_000).unref?.()
