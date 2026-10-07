// Панель «позвать друзей из хаба». Друзья общие на всю экосистему Game is Game,
// поэтому звать их можно прямо отсюда: хаб пришлёт каждому личное сообщение с
// кнопкой, открывающей эту игру. Если игру открыли не из хаба, список пуст и
// панель не показывается вовсе.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { GGAvatar } from '../gg/GGAvatar'

interface HubFriend { id: number; name: string; color: string; face: string }

export function HubInvite({ note }: { note?: string }) {
  const [friends, setFriends] = useState<HubFriend[]>([])
  const [sent, setSent] = useState<number[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api.hubFriends().then(r => setFriends(r.friends)).catch(() => { /* не из хаба */ })
  }, [])

  if (friends.length === 0) return null

  const invite = async (ids: number[]) => {
    setSent(prev => [...prev, ...ids])
    await api.inviteFriends(ids, note).catch(() => { /* кнопка уже показала «позвали» */ })
  }
  const left = friends.filter(f => !sent.includes(f.id))

  return (
    <div className="hub-invite">
      <button className="hub-invite-open" onClick={() => setOpen(o => !o)}>
        👥 {t('Позвать друзей из хаба')} <span className="hub-invite-n">{friends.length}</span>
      </button>
      {open && (
        <div className="hub-invite-list">
          {friends.map(f => (
            <div className="hub-invite-row" key={f.id}>
              <span className="hub-invite-av" style={{ background: f.color, overflow: 'hidden' }}><GGAvatar id={f.id} /></span>
              <span className="hub-invite-nm">{f.name}</span>
              <button
                className="hub-invite-btn"
                disabled={sent.includes(f.id)}
                onClick={() => void invite([f.id])}
              >{sent.includes(f.id) ? t('Позвали') : t('Позвать')}</button>
            </div>
          ))}
          {left.length > 1 && (
            <button className="hub-invite-all" onClick={() => void invite(left.map(f => f.id))}>
              {t('Позвать всех')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
