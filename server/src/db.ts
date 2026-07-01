import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
let dataDir = process.env.DATA_DIR ?? join(here, '..', '..', 'data')
// Never let an unwritable DATA_DIR (e.g. /data with no volume mounted) crash boot.
// Fall back to a temp dir so the service still serves (data just won't persist).
try {
  mkdirSync(dataDir, { recursive: true })
} catch (e) {
  const fallback = join(tmpdir(), 'legion-data')
  console.error(`⚠ DATA_DIR "${dataDir}" is not writable (${(e as Error).message}). ` +
    `Falling back to ${fallback}; mount a volume there to persist data.`)
  mkdirSync(fallback, { recursive: true })
  dataDir = fallback
}

export const db = new Database(join(dataDir, 'legion.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('busy_timeout = 5000')

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)')
  const dir = join(here, 'migrations')
  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name),
  )
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(f)) continue
    db.transaction(() => {
      db.exec(readFileSync(join(dir, f), 'utf8'))
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString())
    })()
    console.log(`migrated: ${f}`)
  }
}

migrate()
