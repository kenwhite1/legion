import { useMemo } from 'react'
import {
  TERRITORIES,
  REGIONS,
  ADJACENCY,
  hexCenter,
  hexCorners,
} from '@shared/map'
import { playerColor } from '../brand'
import type { GameView } from '@shared/view'

const SIZE = 34

// Статичная геометрия карты считается один раз.
const LAYOUT = (() => {
  const centers: Record<string, { x: number; y: number }> = {}
  for (const t of TERRITORIES) centers[t.id] = hexCenter(t.q, t.r, SIZE)
  const xs = Object.values(centers).map(c => c.x)
  const ys = Object.values(centers).map(c => c.y)
  const pad = SIZE * 1.25
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2
  const edges: [string, string][] = []
  for (const t of TERRITORIES) for (const n of ADJACENCY[t.id]) if (t.id < n) edges.push([t.id, n])
  // центроид каждого региона для подписи-«континента»
  const regionCentroid = REGIONS.map(r => {
    const ts = TERRITORIES.filter(t => t.region === r.id)
    const cx = ts.reduce((s, t) => s + centers[t.id].x, 0) / ts.length
    const cy = ts.reduce((s, t) => s + centers[t.id].y, 0) / ts.length
    return { name: r.name, x: cx, y: cy }
  })
  return { centers, viewBox: `${minX} ${minY} ${w} ${h}`, edges, regionCentroid }
})()

const REGION_BY_ID = Object.fromEntries(TERRITORIES.map(t => [t.id, t.region]))

export type TapMode = 'reinforce' | 'attack' | 'fortify' | 'idle'

interface Props {
  view: GameView
  sel: string | null
  targets: Set<string>
  onTap: (id: string) => void
  flash: string | null
}

export function MapView({ view, sel, targets, onTap, flash }: Props) {
  const colorOf = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of view.players) m[p.id] = p.color
    return m
  }, [view.players])

  return (
    <svg viewBox={LAYOUT.viewBox} preserveAspectRatio="xMidYMid meet">
      {/* связи между соседями */}
      <g stroke="rgba(90,66,32,.22)" strokeWidth="2" strokeLinecap="round">
        {LAYOUT.edges.map(([a, b], i) => {
          const ca = LAYOUT.centers[a]; const cb = LAYOUT.centers[b]
          return <line key={i} x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} />
        })}
      </g>

      {TERRITORIES.map(t => {
        const c = LAYOUT.centers[t.id]
        const tile = view.tiles[t.id]
        const col = playerColor(colorOf[tile.owner] ?? 0)
        const region = REGIONS[REGION_BY_ID[t.id]]
        const isSel = sel === t.id
        const isTgt = targets.has(t.id)
        const rimStroke = isSel ? '#f2a93b' : isTgt ? '#d1495b' : region.tintDeep
        const rimWidth = isSel ? 3.6 : isTgt ? 3 : 1.5
        const cls = 'terr' + (isSel ? ' terr-sel' : isTgt ? ' terr-tgt' : '') + (flash === t.id ? ' terr-flash' : '')
        return (
          <g
            key={t.id}
            transform={`translate(${c.x} ${c.y})`}
            onClick={() => onTap(t.id)}
            style={{ cursor: 'pointer' }}
            className={cls}
          >
            {/* региональный ободок */}
            <polygon points={hexCorners(0, 0, SIZE)} fill={region.tint} />
            {/* заливка владельца */}
            <polygon points={hexCorners(0, 0, SIZE * 0.86)} fill={col.base} stroke={col.deep} strokeWidth="1.5" />
            {/* глянец сверху */}
            <ellipse cx="0" cy={-SIZE * 0.34} rx={SIZE * 0.52} ry={SIZE * 0.22} fill="rgba(255,255,255,.22)" />
            {/* подсветка выбора/цели */}
            <polygon points={hexCorners(0, 0, SIZE * 0.86)} fill="none" stroke={rimStroke} strokeWidth={rimWidth}
              strokeDasharray={isTgt && !isSel ? '5 4' : undefined} />
            {/* название */}
            <text className="terr-label" y={-SIZE * 0.5}>{t.name}</text>
            {/* значок армий */}
            <circle cx="0" cy={SIZE * 0.12} r="11.5" fill={col.deep} stroke="rgba(255,255,255,.85)" strokeWidth="1.6" />
            <text className="army-num" x="0" y={SIZE * 0.12} fontSize="13" fill={col.ink}>{tile.armies}</text>
          </g>
        )
      })}

      {/* подписи регионов поверх карты, как выцветшие названия континентов */}
      {LAYOUT.regionCentroid.map((r, i) => (
        <text key={i} className="region-label" x={r.x} y={r.y - SIZE * 0.02}>{r.name}</text>
      ))}
    </svg>
  )
}
