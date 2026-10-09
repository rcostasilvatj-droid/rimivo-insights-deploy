import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      event_type TEXT NOT NULL,
      path TEXT NOT NULL,
      source TEXT NOT NULL,
      product TEXT,
      visitor_hash TEXT NOT NULL,
      session_hash TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_events_site_created ON events(site, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_visitor_created ON events(visitor_hash, created_at);
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      email TEXT,
      product TEXT NOT NULL,
      message TEXT,
      path TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOVO',
      consent_version TEXT NOT NULL,
      consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_leads_site_created ON leads(site, created_at);
  `)
  return db
}

export function insertEvent(db, event, visitorHash, sessionHash) {
  db.prepare(`INSERT INTO events
    (site, event_type, path, source, product, visitor_hash, session_hash, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(event.site, event.type, event.path, event.source, event.product, visitorHash, sessionHash, event.durationSeconds)
}

export function insertLead(db, lead) {
  const result = db.prepare(`INSERT INTO leads
    (site, name, whatsapp, email, product, message, path, source, consent_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(lead.site, lead.name, lead.whatsapp, lead.email, lead.product, lead.message, lead.path, lead.source, lead.consentVersion)
  return Number(result.lastInsertRowid)
}

export function weeklyReport(db, site, days = 7) {
  const since = `-${Math.max(1, Math.min(90, Number(days) || 7))} days`
  const filter = site ? 'AND site = ?' : ''
  const args = site ? [since, site] : [since]
  const one = (sql) => db.prepare(sql.replace('/*site*/', filter)).get(...args)
  const all = (sql) => db.prepare(sql.replace('/*site*/', filter)).all(...args)
  return {
    periodDays: Math.max(1, Math.min(90, Number(days) || 7)),
    site: site || 'all',
    totals: one(`SELECT
      SUM(CASE WHEN event_type='page_view' THEN 1 ELSE 0 END) AS pageViews,
      COUNT(DISTINCT visitor_hash) AS uniqueVisitors,
      COUNT(DISTINCT session_hash) AS sessions,
      SUM(CASE WHEN event_type IN ('click_contact','click_price') THEN 1 ELSE 0 END) AS intentClicks
      FROM events WHERE created_at >= datetime('now', ?) /*site*/`),
    averageSeconds: one(`SELECT CAST(AVG(max_duration) AS INTEGER) AS value FROM (
      SELECT MAX(duration_seconds) AS max_duration FROM events
      WHERE event_type='heartbeat' AND duration_seconds > 0 AND created_at >= datetime('now', ?) /*site*/
      GROUP BY session_hash
    )`).value || 0,
    pages: all(`SELECT path, COUNT(*) AS views FROM events
      WHERE event_type='page_view' AND created_at >= datetime('now', ?) /*site*/
      GROUP BY path ORDER BY views DESC LIMIT 20`),
    sources: all(`SELECT source, COUNT(DISTINCT session_hash) AS sessions FROM events
      WHERE event_type='page_view' AND created_at >= datetime('now', ?) /*site*/
      GROUP BY source ORDER BY sessions DESC LIMIT 20`),
    leads: one(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='NOVO' THEN 1 ELSE 0 END) AS newCount
      FROM leads WHERE created_at >= datetime('now', ?) /*site*/`),
    activeVisitors: db.prepare(`SELECT COUNT(DISTINCT visitor_hash) AS total FROM events
      WHERE created_at >= datetime('now', '-5 minutes') ${site ? 'AND site = ?' : ''}`).get(...(site ? [site] : [])).total || 0,
    generatedAt: new Date().toISOString(),
  }
}

export function listLeads(db, { site = '', status = '', limit = 100 } = {}) {
  const where = []; const args = []
  if (site) { where.push('site = ?'); args.push(site) }
  if (status) { where.push('status = ?'); args.push(status) }
  args.push(Math.max(1, Math.min(500, Number(limit) || 100)))
  return db.prepare(`SELECT id, site, name, whatsapp, email, product, message, path, source, status,
    consent_version AS consentVersion, consented_at AS consentedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`).all(...args)
}

export function updateLeadStatus(db, id, status) {
  const allowed = new Set(['NOVO', 'CONTATADO', 'INTERESSADO', 'CONVERTIDO', 'DESCARTADO'])
  if (!allowed.has(status)) throw new Error('invalid lead status')
  const result = db.prepare(`UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, Number(id))
  if (!result.changes) throw new Error('lead not found')
}

export function findDataSubject(db, { email = '', whatsapp = '' }) {
  if (!email && !whatsapp) throw new Error('email or WhatsApp required')
  return db.prepare(`SELECT id, site, name, whatsapp, email, product, message, status, consent_version AS consentVersion,
    consented_at AS consentedAt, created_at AS createdAt FROM leads
    WHERE (? <> '' AND lower(email) = lower(?)) OR (? <> '' AND whatsapp = ?) ORDER BY created_at DESC`)
    .all(email, email, whatsapp, whatsapp)
}

export function deleteLead(db, id) {
  const result = db.prepare('DELETE FROM leads WHERE id = ?').run(Number(id))
  if (!result.changes) throw new Error('lead not found')
}

export function applyRetention(db, eventDays, leadDays) {
  const events = db.prepare(`DELETE FROM events WHERE created_at < datetime('now', ?)`).run(`-${eventDays} days`).changes
  const leads = db.prepare(`DELETE FROM leads WHERE created_at < datetime('now', ?)`).run(`-${leadDays} days`).changes
  return { events, leads }
}
