import { create } from 'zustand'
import {
  createGame,
  applyAction,
  territoryCount,
  type GameState,
  type Action,
  type GameEvent,
} from '@shared/engine'
import { botDecide, type Difficulty } from '@shared/bots'
import { toView, type GameView } from '@shared/view'
import type { Profile, RoomStateDto } from '@shared/types'
import { api } from './api'
import { haptic } from './telegram'
import { playSfx } from './sound'
import { t } from './i18n'

type Screen = 'home' | 'rules' | 'leaderboard' | 'lobby' | 'game'

interface ResultInfo { won: boolean; territories: number; winnerName: string }
interface BattlePopup { seq: number; from: string; to: string; attackerDice: number[]; defenderDice: number[]; attackerLoss: number; defenderLoss: number; captured: boolean }

interface S {
  ready: boolean
  screen: Screen
  mode: 'solo' | 'online' | null
  profile: Profile | null
  botUsername: string

  solo: GameState | null
  youId: string

  room: RoomStateDto | null
  joinError: string | null
  busy: boolean

  toast: string | null
  result: ResultInfo | null
  battle: BattlePopup | null
  difficulty: Difficulty
  pick: null | 'solo' | 'friend'
  leaderboard: { name: string; wins: number; played: number }[]

  init(): Promise<void>
  go(s: Screen): void
  startSolo(difficulty: Difficulty): void
  quickMatch(): Promise<void>
  createRoom(difficulty: Difficulty): Promise<void>
  joinRoom(code: string): Promise<void>
  startRoom(): Promise<void>
  leaveGame(): void
  loadLeaderboard(): Promise<void>
  send(action: Action): void
  view(): GameView | null
  meId(): string
  ackBattle(): void
}

let botTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
// Идентификатор соло-забега: заводится на старте партии и едет в отчёт хабу,
// чтобы ключ идемпотентности был стабильным при повторе и разным у разных
// партий (соло-движок крутится здесь, сервер про забег ничего не знает).
let soloRunId = ''
const newRunId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
let lastBattleSeq = 0
let lastYourTurn = false

function stopBots() { if (botTimer) clearTimeout(botTimer); botTimer = null }
function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null }

export const useStore = create<S>((set, get) => {
  function toast(text: string) {
    const msg = t(text)
    set({ toast: msg })
    setTimeout(() => { if (get().toast === msg) set({ toast: null }) }, 1700)
  }

  // Реакция на новое состояние (для обоих режимов): всплывающие кубики,
  // звуки и вибрация «твой ход». Событийный поток есть только в соло, поэтому
  // бой и смену хода ловим по полям вида - так работает и онлайн-опрос.
  function reactToView(v: GameView | null) {
    if (!v) return
    if (v.battleSeq !== lastBattleSeq) {
      lastBattleSeq = v.battleSeq
      if (v.lastBattle) {
        set({ battle: { seq: v.battleSeq, ...v.lastBattle } })
        playSfx(v.lastBattle.captured ? 'capture' : 'dice')
        haptic(v.lastBattle.captured ? 'heavy' : 'tap')
      }
    }
    if (v.yourTurn && !lastYourTurn && v.status === 'playing') {
      playSfx('turn'); haptic('select')
    }
    lastYourTurn = v.yourTurn
  }

  function presentSolo(events: GameEvent[]) {
    for (const e of events) {
      if (e.kind === 'place') playSfx('place')
      else if (e.kind === 'capture') { /* звук идёт из reactToView */ }
      else if (e.kind === 'eliminate') toast(`${t(nameOf(e.playerId))} ${t('повержен')}`)
      else if (e.kind === 'fortify') playSfx('place')
    }
  }
  function nameOf(id: string): string {
    return get().solo?.players.find(p => p.id === id)?.name
      ?? get().room?.view?.players.find(p => p.id === id)?.name ?? '?'
  }

  // -- SOLO --------------------------------------------------------------------
  function afterSolo(s: GameState) {
    reactToView(toView(s, get().youId))
    if (s.status === 'finished') { finishSolo(s); return }
    if (s.players[s.turn].isBot) scheduleBot(!!s.lastBattle)
  }

  function scheduleBot(afterBattle: boolean) {
    stopBots()
    botTimer = setTimeout(stepBot, afterBattle ? 1150 : 560)
  }

  function stepBot() {
    const s = get().solo
    if (!s || s.status !== 'playing') return
    const cur = s.players[s.turn]
    if (!cur.isBot) return
    let r = applyAction(s, botDecide(s, cur.id, get().difficulty))
    if (r.error) {
      // подстраховка: если ход бота почему-то отклонён, завершаем его ход
      r = applyAction(s, { type: 'endTurn', playerId: cur.id })
      if (r.error) return
    }
    set({ solo: r.state })
    presentSolo(r.events)
    afterSolo(r.state)
  }

  function finishSolo(s: GameState) {
    stopBots()
    const won = s.winnerId === get().youId
    const winner = s.players.find(p => p.id === s.winnerId)
    playSfx(won ? 'win' : 'lose')
    haptic(won ? 'success' : 'warn')
    set({ result: { won, territories: territoryCount(s, get().youId), winnerName: winner?.name ?? '-' } })
    api.soloResult(won, territoryCount(s, get().youId), soloRunId).then(r => set({ profile: r.profile })).catch(() => {})
  }

  function soloApply(action: Action) {
    const s = get().solo
    if (!s) return
    const r = applyAction(s, action)
    if (r.error) { haptic('warn'); return }
    if (action.type === 'endTurn' || action.type === 'endAttack') playSfx('tap')
    set({ solo: r.state })
    presentSolo(r.events)
    afterSolo(r.state)
  }

  // -- ONLINE ------------------------------------------------------------------
  function applyRoom(next: RoomStateDto) {
    const prev = get().room
    const inLobby = get().screen === 'lobby'
    set({ room: next })
    // Присоединившийся (и игрок быстрого подбора) узнаёт о старте только из
    // опроса: как только партия пошла, уводим его из лобби прямо на карту.
    if (inLobby && next.room.started && next.view) { set({ screen: 'game' }); haptic('select') }
    reactToView(next.view)
    if (next.roundOver && !prev?.roundOver) {
      const won = !!next.roundOver.won
      playSfx(won ? 'win' : 'lose')
      haptic(won ? 'success' : 'warn')
      set({ result: { won, territories: 0, winnerName: next.roundOver.winnerName } })
      api.profile().then(r => set({ profile: r.profile })).catch(() => {})
    }
  }

  function startPoll(code: string) {
    stopPoll()
    pollTimer = setInterval(async () => {
      try { applyRoom(await api.roomState(code)) } catch { /* transient */ }
    }, 1100)
  }

  async function onlineAct(action: Action) {
    const room = get().room
    if (!room) return
    if (action.type === 'place') playSfx('place')
    else if (action.type === 'endTurn' || action.type === 'endAttack') playSfx('tap')
    else if (action.type === 'fortify') playSfx('place')
    try {
      applyRoom(await api.roomAction(room.room.code, action))
    } catch (e) {
      haptic('warn')
      const code = (e as { data?: { error?: string } })?.data?.error
      if (code && code !== 'not_your_turn') toast('Не получилось, попробуй ещё')
    }
  }

  return {
    ready: false,
    screen: 'home',
    mode: null,
    profile: null,
    botUsername: 'legion_play_bot',
    solo: null,
    youId: 'you',
    room: null,
    joinError: null,
    busy: false,
    toast: null,
    result: null,
    battle: null,
    difficulty: 'medium',
    pick: null,
    leaderboard: [],

    async init() {
      try {
        const { profile, startParam, botUsername } = await api.auth()
        set({ profile, botUsername: botUsername || 'legion_play_bot', ready: true })
        if (startParam?.startsWith('room_')) {
          const code = startParam.slice(5).toUpperCase()
          if (/^[A-Z0-9]{4}$/.test(code)) await get().joinRoom(code)
        }
      } catch {
        set({ ready: true }) // офлайн: соло всё равно доступно
      }
    },

    go(screen) {
      haptic('tap')
      if (screen !== 'lobby' && screen !== 'game') stopPoll()
      set({ screen, pick: null })
    },

    startSolo(difficulty) {
      stopBots(); stopPoll()
      lastBattleSeq = 0; lastYourTurn = false
      const youId = 'you'
      soloRunId = newRunId()
      const players = [
        { id: youId, name: get().profile?.name ?? 'Ты', isBot: false },
        { id: 'bot1', name: 'Аскольд', isBot: true },
        { id: 'bot2', name: 'Борислав', isBot: true },
        { id: 'bot3', name: 'Всеволод', isBot: true },
      ]
      const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
      const game = createGame({ players, seed })
      set({ mode: 'solo', youId, solo: game, screen: 'game', result: null, battle: null, pick: null, difficulty })
      haptic('tap')
      reactToView(toView(game, youId))
      if (game.players[game.turn].isBot) scheduleBot(false)
    },

    async quickMatch() {
      set({ busy: true, joinError: null })
      lastBattleSeq = 0; lastYourTurn = false
      try {
        const st = await api.roomQuick()
        set({ mode: 'online', room: st, screen: 'lobby', result: null, battle: null, busy: false })
        startPoll(st.room.code)
      } catch {
        set({ busy: false, joinError: t('Не удалось подобрать игру. Проверь связь.') })
      }
    },

    async createRoom(difficulty) {
      set({ busy: true, joinError: null, pick: null })
      lastBattleSeq = 0; lastYourTurn = false
      try {
        const st = await api.roomCreate(difficulty)
        set({ mode: 'online', room: st, screen: 'lobby', result: null, battle: null, busy: false })
        startPoll(st.room.code)
      } catch {
        set({ busy: false, joinError: t('Не удалось создать комнату. Проверь связь.') })
      }
    },

    async joinRoom(code) {
      set({ busy: true, joinError: null })
      lastBattleSeq = 0; lastYourTurn = false
      try {
        const st = await api.roomJoin(code)
        set({ mode: 'online', room: st, screen: 'lobby', result: null, battle: null, busy: false })
        startPoll(st.room.code)
      } catch (e) {
        const err = (e as { data?: { error?: string } })?.data?.error
        set({ busy: false, joinError: err === 'no_room' ? t('Нет комнаты с таким кодом.') : err === 'already_started' ? t('Игра уже началась.') : err === 'full' ? t('В комнате нет мест.') : t('Не удалось войти.') })
      }
    },

    async startRoom() {
      const room = get().room
      if (!room) return
      set({ busy: true })
      try {
        const st = await api.roomStart(room.room.code)
        set({ room: st, screen: 'game', busy: false })
        reactToView(st.view)
      } catch {
        set({ busy: false })
        toast('Не удалось начать')
      }
    },

    leaveGame() {
      stopBots()
      const room = get().room
      if (room && get().mode === 'online') api.roomLeave(room.room.code).catch(() => {})
      stopPoll()
      set({ mode: null, solo: null, room: null, result: null, battle: null, screen: 'home' })
      haptic('tap')
    },

    async loadLeaderboard() {
      try { set({ leaderboard: (await api.leaderboard()).top }) } catch { /* офлайн */ }
    },

    send(action) {
      if (get().mode === 'solo') soloApply(action)
      else onlineAct(action)
    },

    view() {
      const st = get()
      if (st.mode === 'solo' && st.solo) return toView(st.solo, st.youId)
      if (st.mode === 'online' && st.room?.view) return st.room.view
      return null
    },

    meId() {
      return get().mode === 'solo' ? get().youId : (get().room?.view?.youId ?? '')
    },

    ackBattle() { set({ battle: null }) },
  }
})
