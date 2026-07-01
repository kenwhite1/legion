import { useStore } from '../store'
import { Logo } from './Logo'
import { APP_NAME } from '../brand'

export function Home() {
  const profile = useStore(s => s.profile)
  const quickMatch = useStore(s => s.quickMatch)
  const go = useStore(s => s.go)
  const busy = useStore(s => s.busy)

  return (
    <div className="home rise">
      <div className="brand">
        <Logo />
        <div className="brand-name">{APP_NAME}</div>
        <div className="brand-tag">Командуй армиями, захватывай земли и подчини всю карту</div>
      </div>

      {profile && (
        <div className="stat-strip">
          <div className="stat-pill"><div className="v">{profile.wins}</div><div className="l">Победы</div></div>
          <div className="stat-pill"><div className="v">{profile.streak}</div><div className="l">Серия</div></div>
          <div className="stat-pill"><div className="v">{profile.coins}</div><div className="l">Монеты</div></div>
        </div>
      )}

      <div className="menu-spacer" />

      <div className="menu">
        <button className="tile primary" onClick={() => useStore.setState({ pick: 'solo' })}>
          <span className="tile-emoji">⚔️</span>
          <span className="tile-text">
            <span className="tile-title">Одиночная игра</span>
            <span className="tile-sub">Против ботов, выбери сложность</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={quickMatch} disabled={busy}>
          <span className="tile-emoji">⚡</span>
          <span className="tile-text">
            <span className="tile-title">Быстрая игра</span>
            <span className="tile-sub">Случайные соперники онлайн</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={() => useStore.setState({ pick: 'friend' })} disabled={busy}>
          <span className="tile-emoji">🤝</span>
          <span className="tile-text">
            <span className="tile-title">Игра с друзьями</span>
            <span className="tile-sub">Создай комнату и поделись кодом</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={() => go('lobby')}>
          <span className="tile-emoji">🔢</span>
          <span className="tile-text">
            <span className="tile-title">Войти по коду</span>
            <span className="tile-sub">Введи код из 4 символов</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <div style={{ display: 'flex', gap: 13 }}>
          <button className="tile" style={{ flex: 1 }} onClick={() => { go('leaderboard'); useStore.getState().loadLeaderboard() }}>
            <span className="tile-emoji">🏆</span>
            <span className="tile-text"><span className="tile-title">Рейтинг</span></span>
          </button>
          <button className="tile" style={{ flex: 1 }} onClick={() => go('rules')}>
            <span className="tile-emoji">📖</span>
            <span className="tile-text"><span className="tile-title">Правила</span></span>
          </button>
        </div>
      </div>
    </div>
  )
}
