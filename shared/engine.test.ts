import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TERRITORIES,
  TERRITORY_IDS,
  REGIONS,
  ADJACENCY,
  areAdjacent,
  territoriesInRegion,
} from './map'
import {
  createGame,
  applyAction,
  reinforcementsFor,
  territoryCount,
  territoriesOf,
  attackSources,
  type GameState,
} from './engine'
import { botDecide } from './bots'
import { toView } from './view'

// ── Карта ────────────────────────────────────────────────────────────────────
test('map: 20 territories, 5 regions of 4', () => {
  assert.equal(TERRITORIES.length, 20)
  assert.equal(REGIONS.length, 5)
  for (const r of REGIONS) assert.equal(territoriesInRegion(r.id).length, 4)
})

test('map: territory ids are unique', () => {
  assert.equal(new Set(TERRITORY_IDS).size, TERRITORY_IDS.length)
})

test('map: adjacency is symmetric and non-empty', () => {
  for (const id of TERRITORY_IDS) {
    assert.ok(ADJACENCY[id].length > 0, `${id} has no neighbours`)
    for (const n of ADJACENCY[id]) {
      assert.ok(areAdjacent(n, id), `${id}->${n} not symmetric`)
      assert.notEqual(n, id, 'no self-adjacency')
    }
  }
})

function bfsReach(start: string, allowed: Set<string>): Set<string> {
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of ADJACENCY[cur]) {
      if (allowed.has(n) && !seen.has(n)) { seen.add(n); queue.push(n) }
    }
  }
  return seen
}

test('map: whole world is connected', () => {
  const all = new Set(TERRITORY_IDS)
  const reached = bfsReach(TERRITORY_IDS[0], all)
  assert.equal(reached.size, TERRITORY_IDS.length)
})

test('map: each region is contiguous', () => {
  for (const r of REGIONS) {
    const ids = new Set(territoriesInRegion(r.id))
    const reached = bfsReach([...ids][0], ids)
    assert.equal(reached.size, ids.size, `region ${r.name} not contiguous`)
  }
})

// ── Создание партии ──────────────────────────────────────────────────────────
const FOUR = [
  { id: 'p1', name: 'A', isBot: false },
  { id: 'p2', name: 'B', isBot: true },
  { id: 'p3', name: 'C', isBot: true },
  { id: 'p4', name: 'D', isBot: true },
]

test('createGame: deterministic for a seed', () => {
  const a = createGame({ players: FOUR, seed: 12345 })
  const b = createGame({ players: FOUR, seed: 12345 })
  assert.deepEqual(a.tiles, b.tiles)
  assert.equal(a.reinforcements, b.reinforcements)
})

test('createGame: every territory owned, at least 1 army', () => {
  const g = createGame({ players: FOUR, seed: 7 })
  for (const id of TERRITORY_IDS) {
    assert.ok(g.tiles[id].armies >= 1)
    assert.ok(FOUR.some(p => p.id === g.tiles[id].owner))
  }
})

test('createGame: territories split fairly', () => {
  const g = createGame({ players: FOUR, seed: 7 })
  const counts = FOUR.map(p => territoryCount(g, p.id))
  assert.equal(counts.reduce((a, b) => a + b, 0), 20)
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1)
})

test('reinforcements: minimum three plus region bonus', () => {
  const g = createGame({ players: FOUR, seed: 7 })
  assert.ok(reinforcementsFor(g, 'p1') >= 3)
})

// ── Фазы и правила ───────────────────────────────────────────────────────────
test('place: spends reinforcements and moves to attack phase', () => {
  const g = createGame({ players: FOUR, seed: 3 })
  const mine = territoriesOf(g, 'p1')[0]
  const total = g.reinforcements
  const r = applyAction(g, { type: 'place', playerId: 'p1', territoryId: mine, count: total })
  assert.equal(r.error, undefined)
  assert.equal(r.state.reinforcements, 0)
  assert.equal(r.state.phase, 'attack')
  assert.equal(r.state.tiles[mine].armies, g.tiles[mine].armies + total)
})

test('place: rejects overspend and foreign land', () => {
  const g = createGame({ players: FOUR, seed: 3 })
  const mine = territoriesOf(g, 'p1')[0]
  const foreign = TERRITORY_IDS.find(id => g.tiles[id].owner !== 'p1')!
  assert.ok(applyAction(g, { type: 'place', playerId: 'p1', territoryId: mine, count: 999 }).error)
  assert.ok(applyAction(g, { type: 'place', playerId: 'p1', territoryId: foreign, count: 1 }).error)
})

test('turn: not your turn is rejected', () => {
  const g = createGame({ players: FOUR, seed: 3 })
  assert.equal(applyAction(g, { type: 'endTurn', playerId: 'p2' }).error, 'not_your_turn')
})

// helper: get p1 into the attack phase with a guaranteed strong attack set up
function intoAttack(seed: number): GameState {
  const g = createGame({ players: FOUR, seed })
  const mine = territoriesOf(g, 'p1')[0]
  return applyAction(g, { type: 'place', playerId: 'p1', territoryId: mine, count: g.reinforcements }).state
}

test('attack: conserves ownership of every tile and army sanity', () => {
  let s = intoAttack(42)
  // fabricate an overwhelming attacker to force a capture within a few rolls
  const from = attackSources(s, 'p1')[0] ?? territoriesOf(s, 'p1')[0]
  const target = TERRITORY_IDS.find(id => s.tiles[id].owner !== 'p1' && areAdjacent(from, id))
  if (from && target) {
    s = { ...s, tiles: { ...s.tiles, [from]: { owner: 'p1', armies: 30 }, [target]: { owner: s.tiles[target].owner, armies: 1 } } }
    let guard = 0
    while (s.tiles[target].owner !== 'p1' && guard++ < 50) {
      const r = applyAction(s, { type: 'attack', playerId: 'p1', from, to: target })
      assert.equal(r.error, undefined)
      s = r.state
      if (s.pendingAdvance) {
        s = applyAction(s, { type: 'advance', playerId: 'p1', count: s.pendingAdvance.max }).state
      }
    }
    assert.equal(s.tiles[target].owner, 'p1', 'overwhelming attacker eventually captures')
  }
  // every tile still has an owner and >=1 army when owned
  for (const id of TERRITORY_IDS) assert.ok(s.tiles[id].armies >= 1)
})

test('pendingAdvance: blocks other actions until resolved', () => {
  let s = intoAttack(99)
  const from = territoriesOf(s, 'p1').find(id => TERRITORY_IDS.some(t => s.tiles[t].owner !== 'p1' && areAdjacent(id, t)))!
  const target = TERRITORY_IDS.find(id => s.tiles[id].owner !== 'p1' && areAdjacent(from, id))!
  s = { ...s, tiles: { ...s.tiles, [from]: { owner: 'p1', armies: 30 }, [target]: { owner: s.tiles[target].owner, armies: 1 } } }
  let guard = 0
  while (!s.pendingAdvance && s.tiles[target].owner !== 'p1' && guard++ < 50) {
    s = applyAction(s, { type: 'attack', playerId: 'p1', from, to: target }).state
  }
  if (s.pendingAdvance) {
    // any non-advance action must be refused
    assert.ok(applyAction(s, { type: 'endAttack', playerId: 'p1' }).error)
    const done = applyAction(s, { type: 'advance', playerId: 'p1', count: s.pendingAdvance.min })
    assert.equal(done.error, undefined)
    assert.equal(done.state.pendingAdvance, null)
  }
})

test('endTurn: passes control to the next alive player and refills reinforcements', () => {
  const s = intoAttack(5)
  const r = applyAction(s, { type: 'endTurn', playerId: 'p1' })
  assert.equal(r.error, undefined)
  assert.equal(r.state.turn, 1)
  assert.equal(r.state.phase, 'reinforce')
  assert.ok(r.state.reinforcements >= 3)
})

// ── Полная партия ботами: доказательство отсутствия зависаний ────────────────
test('full bot game terminates with a single winner', () => {
  for (const seed of [1, 2, 3, 7, 42, 100, 2024]) {
    let s = createGame({
      players: [
        { id: 'p1', name: 'A', isBot: true },
        { id: 'p2', name: 'B', isBot: true },
        { id: 'p3', name: 'C', isBot: true },
        { id: 'p4', name: 'D', isBot: true },
      ],
      seed,
    })
    const diffs = ['easy', 'medium', 'hard', 'medium'] as const
    let guard = 0
    while (s.status === 'playing' && guard++ < 20000) {
      const cur = s.players[s.turn]
      const diff = diffs[s.turn]
      const r = applyAction(s, botDecide(s, cur.id, diff))
      assert.equal(r.error, undefined, `seed ${seed}: ${JSON.stringify(botDecide(s, cur.id, diff))} -> ${r.error}`)
      s = r.state
      // board invariant: every tile holds >=1 army, except a just-captured tile
      // that is still awaiting its mandatory advance (transient 0).
      for (const id of TERRITORY_IDS) {
        if (s.pendingAdvance && id === s.pendingAdvance.to) continue
        assert.ok(s.tiles[id].armies >= 1, `seed ${seed}: ${id} had ${s.tiles[id].armies}`)
      }
    }
    assert.equal(s.status, 'finished', `seed ${seed} did not finish (guard ${guard})`)
    assert.ok(s.winnerId, `seed ${seed} has no winner`)
    assert.equal(s.players.filter(p => p.alive).length, 1)
    // winner owns the whole map
    assert.equal(territoryCount(s, s.winnerId!), 20)
  }
})

test('toView: reports your turn and per-player tallies', () => {
  const g = createGame({ players: FOUR, seed: 11 })
  const v = toView(g, 'p1')
  assert.equal(v.yourTurn, true)
  assert.equal(v.players.length, 4)
  const totalTerr = v.players.reduce((a, p) => a + p.territories, 0)
  assert.equal(totalTerr, 20)
})
