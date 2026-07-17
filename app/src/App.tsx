import { useEffect } from 'react'
import { useStore } from './store'
import { Home } from './screens/Home'
import { Board } from './screens/Board'
import { Lobby } from './screens/Lobby'
import { Rules } from './screens/Rules'
import { Leaderboard } from './screens/Leaderboard'
import { Logo } from './screens/Logo'
import { APP_NAME } from './brand'
import { t, useLang } from './i18n'
import type { Difficulty } from '@shared/bots'

const CONFETTI = ['#d1495b', '#3a86c8', '#4c9a6a', '#e0a33a', '#8a63c4']
const DIFFS: { d: Difficulty; label: string; sub: string; emoji: string }[] = [
  { d: 'easy', label: 'Легко', sub: 'Осторожные соперники', emoji: '🌱' },
  { d: 'medium', label: 'Средне', sub: 'Достойные полководцы', emoji: '🎯' },
  { d: 'hard', label: 'Сложно', sub: 'Безжалостные стратеги', emoji: '🔥' },
]

export function App() {
  useLang()
  const ready = useStore(s => s.ready)
  const screen = useStore(s => s.screen)
  const init = useStore(s => s.init)

  useEffect(() => { init() }, [init])

  if (!ready) {
    return (
      <div className="app">
        <div className="home" style={{ justifyContent: 'center' }}>
          <div className="brand" style={{ animation: 'pop-in .5s ease both' }}>
            <Logo />
            <div className="brand-name">{APP_NAME}</div>
            <div className="brand-tag">{t('Разворачиваем карту…')}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {screen === 'home' && <Home />}
      {screen === 'game' && <Board />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'rules' && <Rules />}
      {screen === 'leaderboard' && <Leaderboard />}
      <Overlays />
    </div>
  )
}

function Overlays() {
  const pick = useStore(s => s.pick)
  const result = useStore(s => s.result)
  const toast = useStore(s => s.toast)
  const battle = useStore(s => s.battle)
  const startSolo = useStore(s => s.startSolo)
  const createRoom = useStore(s => s.createRoom)

  const choose = (d: Difficulty) => { if (pick === 'friend') createRoom(d); else startSolo(d) }

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      {battle && <DicePopup />}

      {pick && (
        <div className="scrim center" onClick={() => useStore.setState({ pick: null })}>
          <div className="sheet pop" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, textAlign: 'center' }}>{pick === 'friend' ? '🤝' : '⚔️'}</div>
            <h2 style={{ textAlign: 'center', marginTop: 2 }}>
              {pick === 'friend' ? t('Сложность ботов') : t('Выбери сложность')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
              {DIFFS.map(({ d, label, sub, emoji }) => (
                <button key={d} className="tile" onClick={() => choose(d)}>
                  <span className="tile-emoji">{emoji}</span>
                  <span className="tile-text">
                    <span className="tile-title">{t(label)}</span>
                    <span className="tile-sub">{t(sub)}</span>
                  </span>
                  <span className="tile-chev">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {result && <ResultModal />}
    </>
  )
}

function DicePopup() {
  const battle = useStore(s => s.battle)!
  const ack = useStore(s => s.ackBattle)
  useEffect(() => {
    const id = setTimeout(ack, 1600)
    return () => clearTimeout(id)
  }, [battle.seq, ack])

  // отмечаем проигравшие кубики: сравниваем по старшим парам
  const pairs = Math.min(battle.attackerDice.length, battle.defenderDice.length)
  const attLose = battle.attackerDice.map((d, i) => i < pairs && d <= battle.defenderDice[i])
  const defLose = battle.defenderDice.map((d, i) => i < pairs && battle.attackerDice[i] > d)

  return (
   <>
    <div className="dice-scrim" />
    <div className="dicepop">
      <div className="dice-side">
        <span className="lbl">{t('Атака')}</span>
        {battle.attackerDice.map((d, i) => <span key={i} className={`die att${attLose[i] ? ' lose' : ''}`}>{d}</span>)}
      </div>
      <div className="dice-side">
        <span className="lbl">{t('Оборона')}</span>
        {battle.defenderDice.map((d, i) => <span key={i} className={`die def${defLose[i] ? ' lose' : ''}`}>{d}</span>)}
      </div>
      <div className="dice-verdict">
        {battle.captured ? t('🚩 Земля взята!') : `−${battle.attackerLoss} / −${battle.defenderLoss}`}
      </div>
    </div>
   </>
  )
}

function ResultModal() {
  const result = useStore(s => s.result)!
  const mode = useStore(s => s.mode)
  const leaveGame = useStore(s => s.leaveGame)
  const won = result.won

  return (
    <div className="scrim center">
      {won && (
        <div className="confetti">
          {Array.from({ length: 42 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 137) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i % 10) * 0.12}s`,
                transform: `rotate(${i * 35}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="sheet pop result">
        <div className="result-emoji">{won ? '👑' : '🏳️'}</div>
        <h1>{won ? t('Победа!') : `${t('Победил')} ${t(result.winnerName)}`}</h1>
        <div className="result-sub">{won ? t('Ты подчинил всю карту.') : t('В следующий раз повезёт больше!')}</div>
        {won && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <span className="coin-chip">🪙 +{25 + result.territories} {t('монет')}</span>
          </div>
        )}
        <button className="btn block lg" onClick={leaveGame}>{t('В меню')}</button>
      </div>
    </div>
  )
}
