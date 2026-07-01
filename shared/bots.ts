// --- Боты-полководцы ---------------------------------------------------------
// Приличная человекоподобная эвристика. Возвращает РОВНО одно действие для
// текущего под-состояния бота, так что драйвер может крутить
// applyAction(botDecide(...)) пока ход не вернётся к человеку.
//
// Сложность меняет манеру: easy расставляет силы кое-как и атакует робко,
// medium играет ровно, hard концентрирует армии и давит при первом же перевесе.

import {
  type Action,
  type GameState,
  currentPlayer,
  territoriesOf,
  attackSources,
  attackTargets,
  fortifyTargets,
} from './engine'
import { TERRITORY_IDS, areAdjacent } from './map'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Одно действие бота для текущего под-состояния (должен быть ход бота). */
export function botDecide(s: GameState, botId: string, difficulty: Difficulty = 'medium'): Action {
  const cur = currentPlayer(s)
  if (cur.id !== botId) return { type: 'endTurn', playerId: botId } // подстраховка
  if (s.pendingAdvance) return advanceMove(s, botId)
  if (s.phase === 'reinforce') return reinforceMove(s, botId, difficulty)
  if (s.phase === 'attack') return attackMove(s, botId, difficulty)
  return fortifyMove(s, botId, difficulty)
}

// стабильный псевдослучай в [0,1) из состояния — одна и та же позиция решает
// одинаково (без Math.random в общем коде)
function jitter(s: GameState): number {
  let sum = 0
  for (const id of TERRITORY_IDS) sum += s.tiles[id].armies
  let h = (s.turnCount * 2654435761 + s.reinforcements * 40503 + sum * 101) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return (h % 1000) / 1000
}

function armies(s: GameState, id: string): number {
  return s.tiles[id].armies
}

// Земли игрока, граничащие с врагом (передовая).
function borders(s: GameState, playerId: string): string[] {
  return territoriesOf(s, playerId).filter(id => attackTargets(s, id).length > 0)
}

function weakestEnemyNeighbour(s: GameState, id: string): number {
  const targets = attackTargets(s, id)
  return targets.reduce((min, t) => Math.min(min, armies(s, t)), Infinity)
}

function strongestEnemyPressure(s: GameState, id: string): number {
  const targets = attackTargets(s, id)
  return targets.reduce((sum, t) => sum + armies(s, t), 0)
}

// --- ввод войск после захвата ------------------------------------------------
function advanceMove(s: GameState, botId: string): Action {
  const pa = s.pendingAdvance!
  // Если исходная земля осталась на передовой — оставим там немного обороны.
  const exposed = attackTargets(s, pa.from).length > 0
  let count = exposed ? Math.max(pa.min, Math.floor(pa.max / 2)) : pa.max
  count = Math.min(pa.max, Math.max(pa.min, count))
  return { type: 'advance', playerId: botId, count }
}

// --- подкрепление ------------------------------------------------------------
function reinforceMove(s: GameState, botId: string, diff: Difficulty): Action {
  const front = borders(s, botId)
  const pool = front.length ? front : territoriesOf(s, botId)

  if (diff === 'easy') {
    // Копит всё на одной случайной передовой — концентрирует силу, но выбирает
    // точку удара наугад (оттого и слабее опытного соперника).
    const idx = Math.min(Math.floor(jitter(s) * pool.length), pool.length - 1)
    return { type: 'place', playerId: botId, territoryId: pool[idx], count: s.reinforcements }
  }

  // medium / hard: копим силу там, где легче всего пробить слабейшего соседа.
  let best = pool[0]
  let bestScore = -Infinity
  for (const id of pool) {
    const weakest = weakestEnemyNeighbour(s, id)
    const margin = (armies(s, id) + s.reinforcements - 1) - (isFinite(weakest) ? weakest : 0)
    const pressure = strongestEnemyPressure(s, id)
    // hard мыслит наступательно (маржа пробоя), medium — балансирует с обороной.
    const score = diff === 'hard' ? margin + pressure * 0.2 : margin * 0.6 + pressure * 0.5
    if (score > bestScore) { bestScore = score; best = id }
  }
  return { type: 'place', playerId: botId, territoryId: best, count: s.reinforcements }
}

// --- наступление -------------------------------------------------------------
function attackMove(s: GameState, botId: string, diff: Difficulty): Action {
  const sources = attackSources(s, botId)
  if (sources.length === 0) return { type: 'endAttack', playerId: botId }

  let best: { from: string; to: string; score: number } | null = null
  for (const from of sources) {
    const power = armies(s, from) - 1
    for (const to of attackTargets(s, from)) {
      const def = armies(s, to)
      let score = power - def // перевес атакующего
      // Добить игрока, у которого это последняя земля, — приоритет.
      const owner = s.tiles[to].owner
      const ownerLands = territoriesOf(s, owner).length
      if (ownerLands === 1) score += 3
      if (!best || score > best.score) best = { from, to, score }
    }
  }
  if (!best) return { type: 'endAttack', playerId: botId }

  // Порог перевеса, при котором бот идёт в атаку.
  const threshold = diff === 'hard' ? 0 : diff === 'medium' ? 1 : 2
  // easy иногда робеет — но при явном перевесе всё же давит, чтобы добивать.
  const timid = diff === 'easy' && best.score < 4 && jitter(s) < 0.3
  if (best.score >= threshold && !timid) {
    return { type: 'attack', playerId: botId, from: best.from, to: best.to }
  }
  return { type: 'endAttack', playerId: botId }
}

// --- манёвр ------------------------------------------------------------------
function fortifyMove(s: GameState, botId: string, diff: Difficulty): Action {
  if (diff === 'easy' && jitter(s) < 0.6) return { type: 'endTurn', playerId: botId }

  // Ищем тыловую землю (без вражеских соседей) с лишними армиями и двигаем их
  // на соседнюю передовую.
  const owned = territoriesOf(s, botId).slice().sort((a, b) => armies(s, b) - armies(s, a))
  for (const from of owned) {
    if (armies(s, from) < 2) continue
    if (attackTargets(s, from).length > 0) continue // это передовая — не оголяем
    const fronts = fortifyTargets(s, from).filter(t => attackTargets(s, t).length > 0)
    if (fronts.length === 0) continue
    const to = fronts.reduce((a, b) => (strongestEnemyPressure(s, b) > strongestEnemyPressure(s, a) ? b : a))
    return { type: 'fortify', playerId: botId, from, to, count: armies(s, from) - 1 }
  }
  return { type: 'endTurn', playerId: botId }
}

// Подсказка для интерфейса: есть ли у игрока вообще возможность атаковать.
export function hasAnyAttack(s: GameState, playerId: string): boolean {
  return attackSources(s, playerId).length > 0
}

// прямое соседство — реэкспорт для удобства клиента
export { areAdjacent }
