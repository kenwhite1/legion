// --- Карта мира «Легион» ----------------------------------------------------
// Статические данные карты: территории на гексовой сетке, регионы и связи.
// И движок (логика боёв), и клиент (отрисовка) используют один источник правды,
// поэтому соседство считается один раз из координат гексов и дальше не расходится.
//
// Координаты — «остроконечная» аксиальная сетка (pointy-top axial): у каждого
// гекса ровно шесть соседей, что даёт честное, симметричное соседство без
// ручных ошибок. Пиксельные позиции выводятся из тех же (q, r).

export interface Region {
  id: number
  name: string
  bonus: number // подкрепления за полный контроль региона
  tint: string // цвет-подсветка территории на карте
  tintDeep: string
}

export interface Territory {
  id: string
  name: string
  region: number
  q: number
  r: number
}

export const REGIONS: Region[] = [
  { id: 0, name: 'Стужа', bonus: 3, tint: '#bfe3f2', tintDeep: '#8fc7de' },
  { id: 1, name: 'Заречье', bonus: 3, tint: '#c9e6bf', tintDeep: '#9fce90' },
  { id: 2, name: 'Сердце', bonus: 5, tint: '#f3d9a8', tintDeep: '#e0bd7e' },
  { id: 3, name: 'Восход', bonus: 4, tint: '#f2c9bf', tintDeep: '#dea08f' },
  { id: 4, name: 'Полудень', bonus: 4, tint: '#d9c9ec', tintDeep: '#b79fd6' },
]

// 20 территорий, по 4 в каждом регионе. Каждый регион — связный кусок карты.
export const TERRITORIES: Territory[] = [
  // Стужа (север)
  { id: 't1', name: 'Ледовье', region: 0, q: 0, r: 0 },
  { id: 't2', name: 'Морозная', region: 0, q: 1, r: 0 },
  { id: 't3', name: 'Стужград', region: 0, q: 2, r: 0 },
  { id: 't6', name: 'Белолесье', region: 0, q: 1, r: 1 },
  // Заречье (запад)
  { id: 't4', name: 'Заречье', region: 1, q: -1, r: 1 },
  { id: 't5', name: 'Туманы', region: 1, q: 0, r: 1 },
  { id: 't8', name: 'Рудный', region: 1, q: -1, r: 2 },
  { id: 't9', name: 'Излучина', region: 1, q: 0, r: 2 },
  // Сердце (центр)
  { id: 't7', name: 'Перекрёсток', region: 2, q: 2, r: 1 },
  { id: 't10', name: 'Сердце', region: 2, q: 1, r: 2 },
  { id: 't11', name: 'Цитадель', region: 2, q: 2, r: 2 },
  { id: 't15', name: 'Вышгород', region: 2, q: 1, r: 3 },
  // Восход (юго-восток)
  { id: 't13', name: 'Восход', region: 3, q: -1, r: 3 },
  { id: 't14', name: 'Златополь', region: 3, q: 0, r: 3 },
  { id: 't17', name: 'Пустоши', region: 3, q: -1, r: 4 },
  { id: 't18', name: 'Дальний', region: 3, q: 0, r: 4 },
  // Полудень (юго-запад)
  { id: 't12', name: 'Пески', region: 4, q: -2, r: 3 },
  { id: 't16', name: 'Закат', region: 4, q: -2, r: 4 },
  { id: 't19', name: 'Гавань', region: 4, q: -3, r: 5 },
  { id: 't20', name: 'Полудень', region: 4, q: -2, r: 5 },
]

// Шесть направлений к соседям в аксиальных координатах (pointy-top).
const HEX_DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
]

const byCoord = new Map<string, Territory>()
for (const t of TERRITORIES) byCoord.set(`${t.q},${t.r}`, t)

// Соседство считается из гексовой сетки: territory A граничит с B, если их
// гексы примыкают. Симметрично по построению.
export const ADJACENCY: Record<string, string[]> = {}
for (const t of TERRITORIES) {
  const neighbours: string[] = []
  for (const [dq, dr] of HEX_DIRS) {
    const n = byCoord.get(`${t.q + dq},${t.r + dr}`)
    if (n) neighbours.push(n.id)
  }
  ADJACENCY[t.id] = neighbours
}

export const TERRITORY_IDS: string[] = TERRITORIES.map(t => t.id)
export const TERRITORY_BY_ID: Record<string, Territory> = Object.fromEntries(
  TERRITORIES.map(t => [t.id, t]),
)

export function areAdjacent(a: string, b: string): boolean {
  return ADJACENCY[a]?.includes(b) ?? false
}

export function territoriesInRegion(region: number): string[] {
  return TERRITORIES.filter(t => t.region === region).map(t => t.id)
}

// --- Отрисовочная геометрия -------------------------------------------------
// Пиксельный центр гекса из (q, r). Значения затем нормализуются во вьюпорт.
const SQRT3 = Math.sqrt(3)
export function hexCenter(q: number, r: number, size: number): { x: number; y: number } {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r }
}

// Вершины остроконечного гекса вокруг центра (для SVG-полигона).
export function hexCorners(cx: number, cy: number, size: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}
