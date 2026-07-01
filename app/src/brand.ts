// Название приложения в одном месте, чтобы переименовать было просто.
export const APP_NAME = 'Легион'

// Палитра игроков: насыщенные, различимые на пергаментной карте цвета.
export interface PlayerColor {
  name: string
  base: string
  deep: string
  light: string
  ink: string // цвет числа армий поверх заливки
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: 'Багрянец', base: '#d1495b', deep: '#a5384a', light: '#e57a89', ink: '#fff' },
  { name: 'Лазурь', base: '#3a86c8', deep: '#2b6698', light: '#77b3e2', ink: '#fff' },
  { name: 'Изумруд', base: '#4c9a6a', deep: '#397a52', light: '#7cc095', ink: '#fff' },
  { name: 'Золото', base: '#e0a33a', deep: '#bd8322', light: '#f0c46e', ink: '#4a3410' },
  { name: 'Аметист', base: '#8a63c4', deep: '#6c489e', light: '#ad8dd9', ink: '#fff' },
  { name: 'Сталь', base: '#5b6b7a', deep: '#42505c', light: '#8b9aa8', ink: '#fff' },
]

export function playerColor(idx: number): PlayerColor {
  return PLAYER_COLORS[idx % PLAYER_COLORS.length]
}
