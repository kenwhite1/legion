import { useStore } from '../store'

export function Leaderboard() {
  const go = useStore(s => s.go)
  const rows = useStore(s => s.leaderboard)
  const profile = useStore(s => s.profile)

  return (
    <div className="page rise">
      <div className="page-head">
        <button className="round-btn" onClick={() => go('home')}>‹</button>
        <h1>Рейтинг 🏆</h1>
      </div>

      {profile && (
        <div className="code-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div style={{ fontSize: 26, fontWeight: 900, color: 'var(--brown-deep)' }}>{profile.wins}</div><div style={{ fontWeight: 800, color: 'var(--ink-soft)' }}>Победы</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 900, color: 'var(--brown-deep)' }}>{profile.played}</div><div style={{ fontWeight: 800, color: 'var(--ink-soft)' }}>Партий</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 900, color: 'var(--brown-deep)' }}>{profile.bestStreak}</div><div style={{ fontWeight: 800, color: 'var(--ink-soft)' }}>Лучшая серия</div></div>
          </div>
        </div>
      )}

      <div className="board-list">
        {rows.length === 0 ? (
          <p className="hintline" style={{ marginTop: 20 }}>Пока никто не играл. Будь первым в таблице!</p>
        ) : (
          rows.map((r, i) => (
            <div className="board-row" key={i}>
              <div className="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
              <div className="nm">{r.name}</div>
              <div className="wins">{r.wins}<span style={{ opacity: .6, fontWeight: 800, fontSize: 12 }}> побед</span></div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
