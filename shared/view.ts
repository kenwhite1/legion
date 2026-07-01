// Готовая к отрисовке проекция GameState для конкретного игрока. «Легион» —
// игра с полной информацией (владельцы и армии видны всем), поэтому вид почти
// повторяет состояние, но добавляет удобные для интерфейса поля (твой ход,
// свои земли, доступные ходы).

import { TERRITORY_IDS } from './map'
import {
  type GameState,
  type Phase,
  type PendingAdvance,
  type BattleInfo,
  territoryCount,
} from './engine'

export interface PublicPlayer {
  id: string
  name: string
  isBot: boolean
  color: number
  alive: boolean
  territories: number
  armies: number
}

export interface TileView {
  owner: string
  armies: number
}

export interface GameView {
  youId: string
  players: PublicPlayer[]
  tiles: Record<string, TileView>
  turn: number
  phase: Phase
  reinforcements: number
  pendingAdvance: PendingAdvance | null
  status: 'playing' | 'finished'
  winnerId: string | null
  yourTurn: boolean
  turnCount: number
  log: string[]
  lastBattle: BattleInfo | null
  battleSeq: number
}

export function toView(s: GameState, youId: string): GameView {
  const armiesOf: Record<string, number> = {}
  for (const p of s.players) armiesOf[p.id] = 0
  const tiles: Record<string, TileView> = {}
  for (const id of TERRITORY_IDS) {
    const t = s.tiles[id]
    tiles[id] = { owner: t.owner, armies: t.armies }
    armiesOf[t.owner] = (armiesOf[t.owner] ?? 0) + t.armies
  }
  return {
    youId,
    players: s.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      color: p.color,
      alive: p.alive,
      territories: territoryCount(s, p.id),
      armies: armiesOf[p.id] ?? 0,
    })),
    tiles,
    turn: s.turn,
    phase: s.phase,
    reinforcements: s.reinforcements,
    pendingAdvance: s.pendingAdvance,
    status: s.status,
    winnerId: s.winnerId,
    yourTurn: s.status === 'playing' && s.players[s.turn]?.id === youId,
    turnCount: s.turnCount,
    log: s.log.slice(-6).map(l => l.text),
    lastBattle: s.lastBattle,
    battleSeq: s.battleSeq,
  }
}
