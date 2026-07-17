// Знак «Легион»: щит с картой из гексов и флагом-штандартом наверху.
import { t } from '../i18n'

export function Logo({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className="brand-logo" aria-label={t('Легион')}>
      <defs>
        <linearGradient id="lg-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f0deb8" />
        </linearGradient>
        <linearGradient id="lg-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe6a0" />
          <stop offset="1" stopColor="#e6a52f" />
        </linearGradient>
      </defs>

      {/* штандарт */}
      <g transform="translate(80 8)">
        <rect x="-1.6" y="0" width="3.2" height="34" rx="1.6" fill="#8a5a33" />
        <path d="M2 3 L26 9 L2 15 Z" fill="url(#lg-gold)" stroke="#c98e1f" strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="0" cy="1" r="3.4" fill="url(#lg-gold)" stroke="#c98e1f" strokeWidth="1" />
      </g>

      {/* щит */}
      <path
        d="M80 30 C104 40 122 40 130 40 C130 92 116 122 80 140 C44 122 30 92 30 40 C38 40 56 40 80 30 Z"
        fill="url(#lg-shield)" stroke="#e0c98f" strokeWidth="3"
        filter="drop-shadow(0 6px 10px rgba(122,79,42,.3))"
      />
      <path
        d="M80 30 C104 40 122 40 130 40 C130 92 116 122 80 140 C44 122 30 92 30 40 C38 40 56 40 80 30 Z"
        fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.4" transform="scale(.965)" transform-origin="80 84"
      />

      {/* карта из гексов внутри щита */}
      <g clipPath="none">
        {HEXES.map((h, i) => (
          <g key={i} transform={`translate(${h.x} ${h.y})`}>
            <polygon points={HEX_PTS} fill={h.deep} />
            <polygon points={HEX_PTS} fill={h.base} transform="scale(.82)" />
            <ellipse cx="0" cy="-4.5" rx="9" ry="4.5" fill="rgba(255,255,255,.32)" />
          </g>
        ))}
      </g>
    </svg>
  )
}

const R = 15
const HEX_PTS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30)
  return `${(R * Math.cos(a)).toFixed(1)},${(R * Math.sin(a)).toFixed(1)}`
}).join(' ')

const HEXES = [
  { x: 80, y: 62, base: '#d1495b', deep: '#a5384a' },
  { x: 63, y: 90, base: '#3a86c8', deep: '#2b6698' },
  { x: 97, y: 90, base: '#4c9a6a', deep: '#397a52' },
  { x: 80, y: 116, base: '#e0a33a', deep: '#bd8322' },
]
