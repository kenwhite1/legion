// --- Движок «Легион» ---------------------------------------------------------
// Чистая, детерминированная машина состояний для стратегии захвата территорий
// в духе классических варгеймов (свой мир, свои правила — без чужих карт).
//
// Ход состоит из трёх фаз:
//   1. Подкрепление — расставь новые армии на свои земли.
//   2. Наступление  — атакуй соседние вражеские земли (бой на кубиках).
//   3. Манёвр       — перебрось армии между своими землями и закончи ход.
//
// Всё случайное идёт через засеянный RNG в состоянии, поэтому онлайн-партия на
// сервере и мгновенная игра на клиенте воспроизводятся одинаково, а тесты
// стабильны.

import { makeRng } from './rng'
import {
  TERRITORY_IDS,
  TERRITORY_BY_ID,
  REGIONS,
  areAdjacent,
  territoriesInRegion,
} from './map'

export type Phase = 'reinforce' | 'attack' | 'fortify'

// Предохранитель от вечных партий: если за это число ходов никто не подчинил
// весь мир (обычно это черепашья оборона ботов), партия закрывается по числу
// territорий. Живые человеко-партии решаются задолго до этого предела.
export const MAX_TURNS = 240

export interface Player {
  id: string
  name: string
  isBot: boolean
  color: number // индекс в палитре игроков
  alive: boolean
}

export interface Tile {
  owner: string // id игрока-владельца
  armies: number
}

export interface PendingAdvance {
  from: string
  to: string
  min: number
  max: number
}

export interface LogEntry {
  text: string
  turn: number
}

export interface GameState {
  players: Player[]
  tiles: Record<string, Tile>
  turn: number // индекс текущего игрока
  phase: Phase
  reinforcements: number // осталось расставить в фазе подкрепления
  pendingAdvance: PendingAdvance | null
  conqueredThisTurn: boolean
  status: 'playing' | 'finished'
  winnerId: string | null
  rngState: number
  turnCount: number
  log: LogEntry[]
  lastBattle: BattleInfo | null // последний бой, для анимации кубиков
  battleSeq: number // растёт с каждым боем, чтобы клиент ловил новые
}

export interface BattleInfo {
  from: string
  to: string
  attackerDice: number[]
  defenderDice: number[]
  attackerLoss: number
  defenderLoss: number
  captured: boolean
}

export type GameEvent =
  | { kind: 'reinforce'; playerId: string; armies: number }
  | { kind: 'place'; territoryId: string; count: number }
  | { kind: 'battle'; info: BattleInfo }
  | { kind: 'capture'; territoryId: string; by: string }
  | { kind: 'eliminate'; playerId: string }
  | { kind: 'fortify'; from: string; to: string; count: number }
  | { kind: 'phase'; phase: Phase }
  | { kind: 'win'; playerId: string }

export type Action =
  | { type: 'place'; playerId: string; territoryId: string; count: number }
  | { type: 'attack'; playerId: string; from: string; to: string }
  | { type: 'advance'; playerId: string; count: number }
  | { type: 'endAttack'; playerId: string }
  | { type: 'fortify'; playerId: string; from: string; to: string; count: number }
  | { type: 'endTurn'; playerId: string }

export interface ApplyResult {
  state: GameState
  events: GameEvent[]
  error?: string
}

// --- запросы к состоянию -----------------------------------------------------

export function currentPlayer(s: GameState): Player {
  return s.players[s.turn]
}

export function territoriesOf(s: GameState, playerId: string): string[] {
  return TERRITORY_IDS.filter(id => s.tiles[id].owner === playerId)
}

export function territoryCount(s: GameState, playerId: string): number {
  let n = 0
  for (const id of TERRITORY_IDS) if (s.tiles[id].owner === playerId) n++
  return n
}

// Полные регионы под контролем игрока дают бонус к подкреплению.
export function regionBonus(s: GameState, playerId: string): number {
  let bonus = 0
  for (const region of REGIONS) {
    const ids = territoriesInRegion(region.id)
    if (ids.every(id => s.tiles[id].owner === playerId)) bonus += region.bonus
  }
  return bonus
}

export function reinforcementsFor(s: GameState, playerId: string): number {
  const count = territoryCount(s, playerId)
  if (count === 0) return 0
  return Math.max(3, Math.floor(count / 3)) + regionBonus(s, playerId)
}

// Земли игрока, с которых вообще можно атаковать (есть >1 армии и вражеский сосед).
export function attackSources(s: GameState, playerId: string): string[] {
  return territoriesOf(s, playerId).filter(
    id => s.tiles[id].armies > 1 && attackTargets(s, id).length > 0,
  )
}

// Вражеские соседи конкретной земли.
export function attackTargets(s: GameState, from: string): string[] {
  const owner = s.tiles[from].owner
  return TERRITORY_IDS.filter(id => s.tiles[id].owner !== owner && areAdjacent(from, id))
}

// Свои соседи для манёвра (куда можно перебросить армии).
export function fortifyTargets(s: GameState, from: string): string[] {
  const owner = s.tiles[from].owner
  return TERRITORY_IDS.filter(id => id !== from && s.tiles[id].owner === owner && areAdjacent(from, id))
}

export function canAttack(s: GameState, playerId: string): boolean {
  return attackSources(s, playerId).length > 0
}

// --- создание партии ---------------------------------------------------------

export interface CreateOptions {
  players: { id: string; name: string; isBot: boolean }[]
  seed: number
}

export function createGame(opts: CreateOptions): GameState {
  const rng = makeRng(opts.seed)
  const players: Player[] = opts.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    color: i,
    alive: true,
  }))
  const n = players.length

  // Раздаём территории по кругу в перемешанном порядке — честно и поровну.
  const order = TERRITORY_IDS.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const tiles: Record<string, Tile> = {}
  order.forEach((id, i) => {
    tiles[id] = { owner: players[i % n].id, armies: 1 }
  })

  // Раскидываем стартовый резерв на свои земли (детерминированно).
  for (const p of players) {
    const owned = order.filter(id => tiles[id].owner === p.id)
    const extra = owned.length * 2
    for (let k = 0; k < extra; k++) {
      const id = owned[Math.floor(rng.next() * owned.length)]
      tiles[id].armies++
    }
  }

  const s: GameState = {
    players,
    tiles,
    turn: 0,
    phase: 'reinforce',
    reinforcements: 0,
    pendingAdvance: null,
    conqueredThisTurn: false,
    status: 'playing',
    winnerId: null,
    rngState: rng.state,
    turnCount: 1,
    log: [],
    lastBattle: null,
    battleSeq: 0,
  }
  s.reinforcements = reinforcementsFor(s, players[0].id)
  pushLog(s, `${players[0].name} получает ${s.reinforcements} подкреплений`)
  return s
}

// --- применение действий -----------------------------------------------------

function clone(s: GameState): GameState {
  const tiles: Record<string, Tile> = {}
  for (const id of TERRITORY_IDS) tiles[id] = { ...s.tiles[id] }
  return {
    ...s,
    players: s.players.map(p => ({ ...p })),
    tiles,
    log: s.log.slice(),
  }
}

function pushLog(s: GameState, text: string): void {
  s.log.push({ text, turn: s.turnCount })
  if (s.log.length > 40) s.log.shift()
}

function fail(s: GameState, error: string): ApplyResult {
  return { state: s, events: [], error }
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.status !== 'playing') return fail(state, 'game_over')
  const cur = currentPlayer(state)
  if (action.playerId !== cur.id) return fail(state, 'not_your_turn')

  // Пока не разрешён захват (сколько армий ввести), другие действия закрыты.
  if (state.pendingAdvance && action.type !== 'advance') return fail(state, 'resolve_advance')

  switch (action.type) {
    case 'place':
      return doPlace(state, action)
    case 'attack':
      return doAttack(state, action)
    case 'advance':
      return doAdvance(state, action)
    case 'endAttack':
      return doEndAttack(state)
    case 'fortify':
      return doFortify(state, action)
    case 'endTurn':
      return doEndTurn(state)
    default:
      return fail(state, 'bad_action')
  }
}

function doPlace(state: GameState, a: Extract<Action, { type: 'place' }>): ApplyResult {
  if (state.phase !== 'reinforce') return fail(state, 'wrong_phase')
  const count = a.count | 0
  if (count < 1 || count > state.reinforcements) return fail(state, 'bad_count')
  const tile = state.tiles[a.territoryId]
  if (!tile || tile.owner !== a.playerId) return fail(state, 'not_your_land')

  const s = clone(state)
  s.tiles[a.territoryId].armies += count
  s.reinforcements -= count
  const events: GameEvent[] = [{ kind: 'place', territoryId: a.territoryId, count }]
  if (s.reinforcements === 0) {
    s.phase = 'attack'
    events.push({ kind: 'phase', phase: 'attack' })
  }
  s.rngState = state.rngState
  return { state: s, events }
}

function rollDie(rng: ReturnType<typeof makeRng>): number {
  return Math.floor(rng.next() * 6) + 1
}

function doAttack(state: GameState, a: Extract<Action, { type: 'attack' }>): ApplyResult {
  if (state.phase !== 'attack') return fail(state, 'wrong_phase')
  const from = state.tiles[a.from]
  const to = state.tiles[a.to]
  if (!from || !to) return fail(state, 'no_territory')
  if (from.owner !== a.playerId) return fail(state, 'not_your_land')
  if (to.owner === a.playerId) return fail(state, 'own_target')
  if (!areAdjacent(a.from, a.to)) return fail(state, 'not_adjacent')
  if (from.armies < 2) return fail(state, 'need_armies')

  const s = clone(state)
  const rng = makeRng(state.rngState)
  const aDiceN = Math.min(3, s.tiles[a.from].armies - 1)
  const dDiceN = Math.min(2, s.tiles[a.to].armies)
  const attackerDice = Array.from({ length: aDiceN }, () => rollDie(rng)).sort((x, y) => y - x)
  const defenderDice = Array.from({ length: dDiceN }, () => rollDie(rng)).sort((x, y) => y - x)

  let attackerLoss = 0
  let defenderLoss = 0
  const pairs = Math.min(aDiceN, dDiceN)
  for (let i = 0; i < pairs; i++) {
    // Ничья — в пользу защитника (классическое правило).
    if (attackerDice[i] > defenderDice[i]) defenderLoss++
    else attackerLoss++
  }
  s.tiles[a.from].armies -= attackerLoss
  s.tiles[a.to].armies -= defenderLoss
  s.rngState = rng.state

  const events: GameEvent[] = []
  let captured = false
  if (s.tiles[a.to].armies <= 0) {
    captured = true
    const loserId = s.tiles[a.to].owner
    s.tiles[a.to].owner = a.playerId
    s.tiles[a.to].armies = 0
    s.conqueredThisTurn = true

    const info: BattleInfo = { from: a.from, to: a.to, attackerDice, defenderDice, attackerLoss, defenderLoss, captured }
    s.lastBattle = info
    s.battleSeq++
    events.push({ kind: 'battle', info })
    events.push({ kind: 'capture', territoryId: a.to, by: a.playerId })
    pushLog(s, `${name(s, a.playerId)} захватывает ${TERRITORY_BY_ID[a.to].name}`)

    // Обязательный ввод войск: минимум — число атакующих кубиков.
    const avail = s.tiles[a.from].armies - 1
    const min = Math.min(aDiceN, avail)
    const max = avail
    if (min >= max) {
      // Двигать нечего или ровно столько — переносим сразу, без вопроса.
      s.tiles[a.from].armies -= max
      s.tiles[a.to].armies += max
    } else {
      s.pendingAdvance = { from: a.from, to: a.to, min, max }
    }

    const elim = checkElimination(s, loserId)
    if (elim) events.push(elim)
    const win = checkWin(s)
    if (win) {
      // Победа наступила прямо на захвате: обязательный ввод войск уже некому
      // делать, поэтому доводим его сразу, чтобы итоговая земля не осталась с 0.
      if (s.pendingAdvance) {
        const pa = s.pendingAdvance
        s.tiles[pa.from].armies -= pa.max
        s.tiles[pa.to].armies += pa.max
        s.pendingAdvance = null
      }
      events.push(win)
      return { state: s, events }
    }
  } else {
    const info: BattleInfo = { from: a.from, to: a.to, attackerDice, defenderDice, attackerLoss, defenderLoss, captured }
    s.lastBattle = info
    s.battleSeq++
    events.push({ kind: 'battle', info })
  }
  return { state: s, events }
}

function doAdvance(state: GameState, a: Extract<Action, { type: 'advance' }>): ApplyResult {
  const pa = state.pendingAdvance
  if (!pa) return fail(state, 'no_advance')
  const count = a.count | 0
  if (count < pa.min || count > pa.max) return fail(state, 'bad_count')
  const s = clone(state)
  s.tiles[pa.from].armies -= count
  s.tiles[pa.to].armies += count
  s.pendingAdvance = null
  s.rngState = state.rngState
  return { state: s, events: [] }
}

function doEndAttack(state: GameState): ApplyResult {
  if (state.phase !== 'attack') return fail(state, 'wrong_phase')
  const s = clone(state)
  s.phase = 'fortify'
  s.rngState = state.rngState
  return { state: s, events: [{ kind: 'phase', phase: 'fortify' }] }
}

function doFortify(state: GameState, a: Extract<Action, { type: 'fortify' }>): ApplyResult {
  if (state.phase !== 'fortify' && state.phase !== 'attack') return fail(state, 'wrong_phase')
  const from = state.tiles[a.from]
  const to = state.tiles[a.to]
  if (!from || !to) return fail(state, 'no_territory')
  if (from.owner !== a.playerId || to.owner !== a.playerId) return fail(state, 'not_your_land')
  if (!areAdjacent(a.from, a.to)) return fail(state, 'not_adjacent')
  const count = a.count | 0
  if (count < 1 || count > from.armies - 1) return fail(state, 'bad_count')

  const s = clone(state)
  s.tiles[a.from].armies -= count
  s.tiles[a.to].armies += count
  pushLog(s, `${name(s, a.playerId)} перебрасывает ${count} в ${TERRITORY_BY_ID[a.to].name}`)
  const events: GameEvent[] = [{ kind: 'fortify', from: a.from, to: a.to, count }]
  advanceTurn(s, events)
  return { state: s, events }
}

function doEndTurn(state: GameState): ApplyResult {
  if (state.phase === 'reinforce') return fail(state, 'wrong_phase')
  const s = clone(state)
  const events: GameEvent[] = []
  advanceTurn(s, events)
  return { state: s, events }
}

// --- служебное ---------------------------------------------------------------

function name(s: GameState, id: string): string {
  return s.players.find(p => p.id === id)?.name ?? '?'
}

function checkElimination(s: GameState, loserId: string): GameEvent | null {
  if (territoryCount(s, loserId) > 0) return null
  const loser = s.players.find(p => p.id === loserId)
  if (!loser || !loser.alive) return null
  loser.alive = false
  pushLog(s, `${loser.name} выбывает из игры`)
  return { kind: 'eliminate', playerId: loserId }
}

function checkWin(s: GameState): GameEvent | null {
  const alive = s.players.filter(p => p.alive)
  if (alive.length <= 1) {
    s.status = 'finished'
    s.winnerId = alive[0]?.id ?? null
    if (s.winnerId) pushLog(s, `${name(s, s.winnerId)} побеждает!`)
    return s.winnerId ? { kind: 'win', playerId: s.winnerId } : null
  }
  return null
}

// Итог по числу земель (и армий как тай-брейк) — на случай упора в лимит ходов.
function totalArmies(s: GameState, playerId: string): number {
  let n = 0
  for (const id of TERRITORY_IDS) if (s.tiles[id].owner === playerId) n += s.tiles[id].armies
  return n
}

function finishByStanding(s: GameState, events: GameEvent[]): void {
  const alive = s.players.filter(p => p.alive)
  const best = alive.slice().sort((a, b) => {
    const dt = territoryCount(s, b.id) - territoryCount(s, a.id)
    if (dt !== 0) return dt
    return totalArmies(s, b.id) - totalArmies(s, a.id)
  })[0]
  s.status = 'finished'
  s.winnerId = best?.id ?? null
  if (s.winnerId) {
    pushLog(s, `${name(s, s.winnerId)} лидирует по землям и побеждает!`)
    events.push({ kind: 'win', playerId: s.winnerId })
  }
}

function advanceTurn(s: GameState, events: GameEvent[]): void {
  if (s.status !== 'playing') return
  const n = s.players.length
  let idx = s.turn
  for (let i = 0; i < n; i++) {
    idx = (idx + 1) % n
    if (s.players[idx].alive) break
  }
  s.turn = idx
  s.turnCount++
  if (s.turnCount > MAX_TURNS) { finishByStanding(s, events); return }
  s.phase = 'reinforce'
  s.conqueredThisTurn = false
  s.pendingAdvance = null
  s.reinforcements = reinforcementsFor(s, s.players[idx].id)
  pushLog(s, `${s.players[idx].name} получает ${s.reinforcements} подкреплений`)
  events.push({ kind: 'reinforce', playerId: s.players[idx].id, armies: s.reinforcements })
}
