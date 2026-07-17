import { useState } from 'react'
import { useStore } from '../store'
import { shareLink, haptic } from '../telegram'
import { APP_NAME } from '../brand'
import { t } from '../i18n'

export function Lobby() {
  const room = useStore(s => s.room)
  const profile = useStore(s => s.profile)
  const botUsername = useStore(s => s.botUsername)
  const startRoom = useStore(s => s.startRoom)
  const leaveGame = useStore(s => s.leaveGame)
  const joinRoom = useStore(s => s.joinRoom)
  const joinError = useStore(s => s.joinError)
  const busy = useStore(s => s.busy)
  const [code, setCode] = useState('')

  // форма входа (комнаты ещё нет)
  if (!room) {
    return (
      <div className="lobby rise">
        <div className="page-head" style={{ alignSelf: 'flex-start' }}>
          <button className="round-btn" onClick={() => useStore.getState().go('home')}>‹</button>
          <h1>{t('Войти по коду')}</h1>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <input
            className="code-input"
            placeholder={t('КОД')}
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            onChange={e => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
          />
          {joinError && <p style={{ color: 'var(--red-deep)', textAlign: 'center', fontWeight: 800, marginTop: 12 }}>{joinError}</p>}
          <button
            className="btn block lg"
            style={{ marginTop: 18 }}
            disabled={code.length !== 4 || busy}
            onClick={() => joinRoom(code)}
          >
            {busy ? t('Входим…') : t('Войти в игру')}
          </button>
        </div>
      </div>
    )
  }

  // быстрый подбор: экран поиска, который сам переходит в игру
  if (room.room.quick) {
    return (
      <div className="lobby rise">
        <div className="page-head" style={{ alignSelf: 'flex-start' }}>
          <button className="round-btn" onClick={leaveGame}>‹</button>
          <h1>{t('Быстрая игра')}</h1>
        </div>
        <div className="code-card" style={{ textAlign: 'center' }}>
          <div className="searching-bob" style={{ fontSize: 46 }}>⚡</div>
          <h2 style={{ color: 'var(--ink)', marginTop: 6 }}>{t('Собираем соперников')}<span className="dots-anim" /></h2>
          <p style={{ color: 'var(--ink-soft)', fontWeight: 800, marginTop: 6 }}>{t('Партия начнётся через пару секунд')}</p>
        </div>
        <div className="seatlist">
          {room.room.players.map(p => (
            <div className="seat" key={p.id}>
              <div className="av">🎖️</div>
              <div className="nm">{t(p.name)}</div>
              <div className="tag wait">{t('в строю')}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // комната с друзьями
  const isHost = room.room.players.find(p => p.isHost)?.id === room.view?.youId ||
    room.room.players.find(p => p.isHost)?.id === `u${profile?.id}`
  const humans = room.room.players.filter(p => !p.isBot)

  const share = () => {
    haptic('tap')
    const link = `https://t.me/${botUsername}?startapp=room_${room.room.code}`
    shareLink(link, `${t('Заходи ко мне в')} ${t(APP_NAME)}! ${t('Код комнаты')} ${room.room.code} ⚔️`)
  }

  return (
    <div className="lobby rise">
      <div className="page-head" style={{ alignSelf: 'flex-start' }}>
        <button className="round-btn" onClick={leaveGame}>‹</button>
        <h1>{t('Военный совет')}</h1>
      </div>

      <div className="code-card">
        <div style={{ fontWeight: 800, color: 'var(--ink-soft)' }}>{t('Поделись кодом')}</div>
        <div className="code-big">{room.room.code}</div>
        <button className="btn accent block" style={{ marginTop: 8 }} onClick={share}>{t('Позвать друзей ↗')}</button>
      </div>

      <div className="seatlist">
        {room.room.players.map(p => (
          <div className="seat" key={p.id}>
            <div className="av">{p.isBot ? '🤖' : '🎖️'}</div>
            <div className="nm">{t(p.name)}</div>
            {p.isHost ? <div className="tag host">{t('ХОЗЯИН')}</div> : p.isBot ? <div className="tag bot">{t('БОТ')}</div> : <div className="tag wait">{t('готов')}</div>}
          </div>
        ))}
        {humans.length < room.room.maxPlayers && (
          <div className="seat" style={{ opacity: 0.6 }}>
            <div className="av">＋</div>
            <div className="nm" style={{ fontWeight: 800 }}>{t('Ждём игроков…')}</div>
          </div>
        )}
      </div>

      <p className="hintline" style={{ marginTop: 16 }}>
        {t('Пустые места займут боты, когда начнёшь.')}
      </p>

      {isHost ? (
        <button className="btn block lg" style={{ maxWidth: 420, marginTop: 8 }} disabled={busy} onClick={startRoom}>
          {busy ? t('Строим войска…') : t('Начать битву ⚔️')}
        </button>
      ) : (
        <p className="hintline" style={{ marginTop: 8 }}>{t('Ждём, пока хозяин начнёт…')}</p>
      )}
    </div>
  )
}
