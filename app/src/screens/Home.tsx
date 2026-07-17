import { useStore } from '../store'
import { Logo } from './Logo'
import { APP_NAME } from '../brand'
import { t, getLang, setLang } from '../i18n'

export function Home() {
  const profile = useStore(s => s.profile)
  const quickMatch = useStore(s => s.quickMatch)
  const go = useStore(s => s.go)
  const busy = useStore(s => s.busy)

  return (
    <div className="home rise">
      <div className="brand">
        <Logo />
        <div className="brand-name">{t(APP_NAME)}</div>
        <div className="brand-tag">{t('Командуй армиями, захватывай земли и подчини всю карту')}</div>
      </div>

      {profile && (
        <div className="stat-strip">
          <div className="stat-pill"><div className="v">{profile.wins}</div><div className="l">{t('Победы')}</div></div>
          <div className="stat-pill"><div className="v">{profile.streak}</div><div className="l">{t('Серия')}</div></div>
          <div className="stat-pill"><div className="v">{profile.coins}</div><div className="l">{t('Монеты')}</div></div>
        </div>
      )}

      <div className="menu-spacer" />

      <div className="menu">
        <button className="tile primary" onClick={() => useStore.setState({ pick: 'solo' })}>
          <span className="tile-emoji">⚔️</span>
          <span className="tile-text">
            <span className="tile-title">{t('Одиночная игра')}</span>
            <span className="tile-sub">{t('Против ботов, выбери сложность')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={quickMatch} disabled={busy}>
          <span className="tile-emoji">⚡</span>
          <span className="tile-text">
            <span className="tile-title">{t('Быстрая игра')}</span>
            <span className="tile-sub">{t('Случайные соперники онлайн')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={() => useStore.setState({ pick: 'friend' })} disabled={busy}>
          <span className="tile-emoji">🤝</span>
          <span className="tile-text">
            <span className="tile-title">{t('Игра с друзьями')}</span>
            <span className="tile-sub">{t('Создай комнату и поделись кодом')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <button className="tile" onClick={() => go('lobby')}>
          <span className="tile-emoji">🔢</span>
          <span className="tile-text">
            <span className="tile-title">{t('Войти по коду')}</span>
            <span className="tile-sub">{t('Введи код из 4 символов')}</span>
          </span>
          <span className="tile-chev">›</span>
        </button>

        <div style={{ display: 'flex', gap: 13 }}>
          <button className="tile" style={{ flex: 1 }} onClick={() => { go('leaderboard'); useStore.getState().loadLeaderboard() }}>
            <span className="tile-emoji">🏆</span>
            <span className="tile-text"><span className="tile-title">{t('Рейтинг')}</span></span>
          </button>
          <button className="tile" style={{ flex: 1 }} onClick={() => go('rules')}>
            <span className="tile-emoji">📖</span>
            <span className="tile-text"><span className="tile-title">{t('Правила')}</span></span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, fontWeight: 800, color: 'var(--ink-soft)' }}>
          <span>{t('Язык')}:</span>
          <button
            onClick={() => setLang('ru')}
            style={{ padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, background: getLang() === 'ru' ? 'var(--brown-deep, #7a5a2a)' : 'rgba(0,0,0,.08)', color: getLang() === 'ru' ? '#fff' : 'inherit' }}
          >RU</button>
          <button
            onClick={() => setLang('en')}
            style={{ padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, background: getLang() === 'en' ? 'var(--brown-deep, #7a5a2a)' : 'rgba(0,0,0,.08)', color: getLang() === 'en' ? '#fff' : 'inherit' }}
          >EN</button>
        </div>
      </div>
    </div>
  )
}
