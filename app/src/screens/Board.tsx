import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { MapView } from '../game/MapView'
import { ADJACENCY } from '@shared/map'
import { toView, type GameView } from '@shared/view'
import type { Action } from '@shared/engine'
import { playerColor } from '../brand'
import { haptic } from '../telegram'
import { t } from '../i18n'

const PHASES = [
  { key: 'reinforce', label: 'Подкрепление', ic: '🛡️' },
  { key: 'attack', label: 'Наступление', ic: '⚔️' },
  { key: 'fortify', label: 'Манёвр', ic: '🏇' },
] as const

// пылинки в тёплом свете над картой (детерминированные позиции)
const MOTES = [
  { l: '18%', t: '30%', d: '0s' }, { l: '72%', t: '22%', d: '1.4s' },
  { l: '40%', t: '55%', d: '3.1s' }, { l: '84%', t: '60%', d: '4.6s' },
  { l: '28%', t: '72%', d: '2.2s' }, { l: '58%', t: '40%', d: '5.5s' },
  { l: '66%', t: '78%', d: '6.7s' },
]

export function Board() {
  const mode = useStore(s => s.mode)
  const solo = useStore(s => s.solo)
  const room = useStore(s => s.room)
  const youId = useStore(s => s.youId)
  const send = useStore(s => s.send)
  const battle = useStore(s => s.battle)
  const leaveGame = useStore(s => s.leaveGame)
  const [sel, setSel] = useState<string | null>(null)
  const [fortifyPick, setFortifyPick] = useState<{ from: string; to: string } | null>(null)

  const view: GameView | null = useMemo(() => {
    if (mode === 'solo' && solo) return toView(solo, youId)
    if (mode === 'online' && room?.view) return room.view
    return null
  }, [mode, solo, room, youId])

  const me = view?.youId ?? ''
  const myTurn = !!view && view.yourTurn && view.status === 'playing'
  const phase = view?.phase ?? 'reinforce'
  const pending = view?.pendingAdvance ?? null

  // выбор источника сбрасываем при смене хода/фазы
  useEffect(() => { setSel(null); setFortifyPick(null) }, [phase, view?.turnCount, myTurn])

  const colorOf = useMemo(() => {
    const m: Record<string, number> = {}
    if (view) for (const p of view.players) m[p.id] = p.color
    return m
  }, [view])

  const targets = useMemo(() => {
    const res = new Set<string>()
    if (!view || !myTurn || pending || !sel) return res
    for (const n of ADJACENCY[sel]) {
      if (phase === 'attack' && view.tiles[n].owner !== me) res.add(n)
      if (phase === 'fortify' && view.tiles[n].owner === me) res.add(n)
    }
    return res
  }, [view, myTurn, pending, sel, phase, me])

  if (!view) {
    return <div className="board" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
      <div className="turn-chip">{t('Готовим карту')}<span className="dots-anim" /></div>
    </div>
  }

  const owns = (id: string) => view.tiles[id].owner === me
  const cur = view.players[view.turn]

  function onTap(id: string) {
    if (!myTurn || pending) return
    if (phase === 'reinforce') {
      if (owns(id)) { send({ type: 'place', playerId: me, territoryId: id, count: 1 }); haptic('tap') }
      return
    }
    if (phase === 'attack') {
      if (sel && targets.has(id)) { send({ type: 'attack', playerId: me, from: sel, to: id }); return }
      if (owns(id) && view.tiles[id].armies > 1) { setSel(prev => (prev === id ? null : id)); haptic('select'); return }
      setSel(null)
      return
    }
    // fortify
    if (sel && targets.has(id)) { setFortifyPick({ from: sel, to: id }); haptic('select'); return }
    if (owns(id) && view.tiles[id].armies > 1) { setSel(id); haptic('select'); return }
    setSel(null)
  }

  const phaseIdx = PHASES.findIndex(p => p.key === phase)

  return (
    <div className="board">
      <div className="board-top">
        <button className="round-btn" onClick={leaveGame} aria-label={t('Выйти')}>‹</button>
        <div className="grow" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className={`turn-chip${myTurn ? ' you' : ''}`}>
            <span className="turn-dot" style={{ background: playerColor(cur.color).base }} />
            {myTurn ? t('Твой ход') : `${t('Ходит')} ${cur.name}`}
          </div>
        </div>
        <div style={{ width: 46 }} />
      </div>

      <div className="legend">
        {view.players.map((p, i) => (
          <div key={p.id} className={`leg${view.turn === i && p.alive ? ' active' : ''}${!p.alive ? ' dead' : ''}`}>
            <span className="leg-dot" style={{ background: playerColor(p.color).base }} />
            <span className="n">{p.id === me ? t('Ты') : t(p.name)}</span>
            {p.alive
              ? <span className="c">{p.territories}🚩<span className="a">{p.armies}⚔</span></span>
              : <span className="c">✕</span>}
          </div>
        ))}
      </div>

      <div className="mapwrap">
        <div className="map-scene">
          <div className="pool" />
          {MOTES.map((m, i) => (
            <span key={i} className="mote" style={{ left: m.l, top: m.t, animationDelay: m.d }} />
          ))}
        </div>
        <MapView view={view} sel={sel} targets={targets} onTap={onTap} flash={battle?.captured ? battle.to : null} />
        <div className="map-vignette" />
      </div>

      <div className="phasebar">
        {PHASES.map((p, i) => (
          <div key={p.key} className={`phase-step${p.key === phase ? ' on' : ''}${i < phaseIdx ? ' done' : ''}`}>
            <span className="ic">{p.ic}</span>
            <span>{t(p.label)}</span>
          </div>
        ))}
      </div>

      <div className="actionbar">
        <div className="hintline">{hint()}</div>
        {myTurn && !pending && (
          <div className="act-row">
            {phase === 'attack' && (
              <>
                <button className="btn cream" onClick={() => send({ type: 'endAttack', playerId: me })}>{t('К манёвру 🏇')}</button>
                <button className="btn accent" onClick={() => send({ type: 'endTurn', playerId: me })}>{t('Завершить ход')}</button>
              </>
            )}
            {phase === 'fortify' && (
              <button className="btn accent block" onClick={() => send({ type: 'endTurn', playerId: me })}>{t('Завершить ход ✓')}</button>
            )}
          </div>
        )}
      </div>

      {pending && myTurn && <AdvanceSheet view={view} send={send} />}
      {fortifyPick && (
        <FortifySheet
          from={fortifyPick.from}
          max={view.tiles[fortifyPick.from].armies - 1}
          onCancel={() => setFortifyPick(null)}
          onConfirm={count => {
            send({ type: 'fortify', playerId: me, from: fortifyPick.from, to: fortifyPick.to, count })
            setFortifyPick(null); setSel(null)
          }}
        />
      )}
    </div>
  )

  function hint() {
    if (!myTurn) return <>{t('Ходит')} <b>{t(cur.name)}</b><span className="dots-anim" /></>
    if (pending) return <>{t('Введи войска на захваченную землю')}</>
    if (phase === 'reinforce') return <>{t('Расставь подкрепления на свои земли')}<span className="reinf-badge">{view!.reinforcements}</span></>
    if (phase === 'attack') return sel ? <>{t('Выбери')} <span className="big">{t('цель')}</span> {t('для атаки')}</> : <>{t('Выбери землю,')} <span className="big">{t('откуда')}</span> {t('напасть')}</>
    return sel ? <>{t('Выбери,')} <span className="big">{t('куда')}</span> {t('перебросить войска')}</> : <>{t('Перебрось войска на границу (по желанию)')}</>
  }
}

function AdvanceSheet({ view, send }: { view: GameView; send: (a: Action) => void }) {
  const pa = view.pendingAdvance!
  const [count, setCount] = useState(pa.max)
  useEffect(() => { setCount(pa.max) }, [pa.from, pa.to, pa.max])

  return (
    <div className="scrim center">
      <div className="sheet pop" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🚩</div>
        <h2 style={{ marginTop: 4 }}>{t('Земля захвачена!')}</h2>
        <p style={{ color: 'var(--ink-soft)', fontWeight: 800, margin: '6px 0 4px' }}>
          {t('Сколько войск ввести на новую землю? Минимум')} {pa.min}.
        </p>
        <div className="advance-row">
          <button className="stepper" onClick={() => setCount(c => Math.max(pa.min, c - 1))}>−</button>
          <div className="advance-count">{count}</div>
          <button className="stepper" onClick={() => setCount(c => Math.min(pa.max, c + 1))}>+</button>
        </div>
        <input className="slider" type="range" min={pa.min} max={pa.max} value={count} onChange={e => setCount(Number(e.target.value))} />
        <button className="btn accent block lg" style={{ marginTop: 14 }} onClick={() => send({ type: 'advance', playerId: view.youId, count })}>
          {t('Ввести')} {count} ⚔️
        </button>
      </div>
    </div>
  )
}

function FortifySheet({ from, max, onCancel, onConfirm }: { from: string; max: number; onCancel: () => void; onConfirm: (n: number) => void }) {
  const [count, setCount] = useState(Math.max(1, Math.min(max, Math.ceil(max / 2))))
  return (
    <div className="scrim center" onClick={onCancel}>
      <div className="sheet pop" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 44 }}>🏇</div>
        <h2 style={{ marginTop: 4 }}>{t('Перебросить войска')}</h2>
        <p style={{ color: 'var(--ink-soft)', fontWeight: 800, margin: '6px 0 4px' }}>{t('После манёвра ход завершится.')}</p>
        <div className="advance-row">
          <button className="stepper" onClick={() => setCount(c => Math.max(1, c - 1))}>−</button>
          <div className="advance-count">{count}</div>
          <button className="stepper" onClick={() => setCount(c => Math.min(max, c + 1))}>+</button>
        </div>
        <input className="slider" type="range" min={1} max={max} value={count} onChange={e => setCount(Number(e.target.value))} />
        <button className="btn accent block lg" style={{ marginTop: 14 }} onClick={() => onConfirm(count)}>{t('Перебросить')} {count} {t('и завершить')}</button>
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={onCancel}>{t('Отмена')}</button>
      </div>
    </div>
  )
}
