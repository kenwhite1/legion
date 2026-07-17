import { useStore } from '../store'
import { t } from '../i18n'

const RULES: { ic: string; title: string; b: string }[] = [
  { ic: '🗺️', title: 'Цель', b: 'Подчини всю карту. Захватишь последнюю землю соперника, он выбывает. Останешься один, ты победил.' },
  { ic: '🛡️', title: 'Подкрепление', b: 'В начале хода получаешь армии: тем больше, чем больше у тебя земель. За полностью занятый регион идёт бонус. Расставь их по своим территориям.' },
  { ic: '⚔️', title: 'Наступление', b: 'Атакуй соседние вражеские земли. Бой на кубиках: у нападающего до трёх, у защитника до двух. Сравниваем по старшим, ничья в пользу защиты.' },
  { ic: '🚩', title: 'Захват', b: 'Сбил всю оборону земли, она твоя. Введи туда часть войск (не меньше числа брошенных кубиков).' },
  { ic: '🏇', title: 'Манёвр', b: 'В конце хода можно один раз перебросить армии между двумя своими соседними землями и укрепить границу.' },
  { ic: '🏰', title: 'Регионы', b: 'Держи целый регион под контролем, и каждый ход он приносит дополнительные армии. Крепкие границы важнее лишней атаки.' },
]

export function Rules() {
  const go = useStore(s => s.go)
  return (
    <div className="page rise">
      <div className="page-head">
        <button className="round-btn" onClick={() => go('home')}>‹</button>
        <h1>{t('Правила')}</h1>
      </div>

      <div className="rule" style={{ background: 'linear-gradient(180deg, #fff7e6, #f7ecd9)' }}>
        <div>
          <div className="rt">{t('Как проходит ход')}</div>
          <div className="rb">{t('Ход состоит из трёх фаз по порядку: подкрепление, наступление и манёвр. Спокойно, вдумчиво, шаг за шагом.')}</div>
        </div>
      </div>

      {RULES.map((r, i) => (
        <div className="rule" key={i}>
          <div className="ic">{r.ic}</div>
          <div>
            <div className="rt">{t(r.title)}</div>
            <div className="rb">{t(r.b)}</div>
          </div>
        </div>
      ))}

      <button className="btn block lg" style={{ marginTop: 8 }} onClick={() => useStore.setState({ pick: 'solo' })}>
        {t('Сыграть одиночную партию ⚔️')}
      </button>
    </div>
  )
}
