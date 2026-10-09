import { createServer } from 'node:http'
import { applyRetention, deleteLead, findDataSubject, insertEvent, insertLead, listLeads, openDatabase, updateLeadStatus, weeklyReport } from './db.mjs'
import { bearerMatches, hashAnonymous, validateEvent, validateLead } from './core.mjs'

const port = Number(process.env.PORT || 10000)
const db = openDatabase(process.env.INSIGHTS_DB_PATH || './data/insights.db')
const hashSecret = process.env.INSIGHTS_HASH_SECRET || ''
const adminToken = process.env.INSIGHTS_ADMIN_TOKEN || ''
const allowedOrigins = new Set((process.env.INSIGHTS_ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean))
const buckets = new Map()
const eventRetentionDays = Math.max(30, Number(process.env.INSIGHTS_EVENT_RETENTION_DAYS || 400))
const leadRetentionDays = Math.max(30, Number(process.env.INSIGHTS_LEAD_RETENTION_DAYS || 730))

if (hashSecret.length < 32) throw new Error('INSIGHTS_HASH_SECRET must contain at least 32 characters')
if (adminToken.length < 24) throw new Error('INSIGHTS_ADMIN_TOKEN must contain at least 24 characters')
if (!allowedOrigins.size) throw new Error('INSIGHTS_ALLOWED_ORIGINS is required')
applyRetention(db, eventRetentionDays, leadRetentionDays)

function cors(req, res) {
  const origin = req.headers.origin || ''
  if (!allowedOrigins.has(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  return true
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function body(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 32_000) throw new Error('payload too large')
  }
  return JSON.parse(raw || '{}')
}

function limited(key, max, windowMs) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > max
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/health') return json(res, 200, { status: 'ok', service: 'rimivo-insights', environment: process.env.NODE_ENV || 'development' })
    if (req.method === 'OPTIONS') {
      if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' })
      res.writeHead(204); return res.end()
    }
    if (url.pathname === '/v1/events' && req.method === 'POST') {
      if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' })
      const event = validateEvent(await body(req))
      const visitorHash = hashAnonymous(event.visitorId, hashSecret)
      const sessionHash = hashAnonymous(event.sessionId, hashSecret)
      if (limited(`event:${sessionHash}`, 120, 60_000)) return json(res, 429, { error: 'rate limit' })
      insertEvent(db, event, visitorHash, sessionHash)
      return json(res, 202, { accepted: true })
    }
    if (url.pathname === '/v1/leads' && req.method === 'POST') {
      if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' })
      const input = await body(req)
      const lead = validateLead(input)
      const visitorHash = hashAnonymous(input.visitorId, hashSecret)
      if (limited(`lead:${visitorHash}`, 3, 86_400_000)) return json(res, 429, { error: 'rate limit' })
      const id = insertLead(db, lead)
      return json(res, 201, { id, status: 'NOVO' })
    }
    if (url.pathname === '/v1/reports/weekly' && req.method === 'GET') {
      if (!bearerMatches(req.headers.authorization, adminToken)) return json(res, 401, { error: 'unauthorized' })
      const site = url.searchParams.get('site') || ''
      if (site && !['rimivo', 'e-massa', 'entregamanager'].includes(site)) return json(res, 400, { error: 'invalid site' })
      return json(res, 200, weeklyReport(db, site, Number(url.searchParams.get('days') || 7)))
    }
    if (url.pathname === '/v1/admin/leads' && req.method === 'GET') {
      if (!bearerMatches(req.headers.authorization, adminToken)) return json(res, 401, { error: 'unauthorized' })
      return json(res, 200, { leads: listLeads(db, { site: url.searchParams.get('site') || '', status: url.searchParams.get('status') || '', limit: url.searchParams.get('limit') || 100 }) })
    }
    const statusMatch = url.pathname.match(/^\/v1\/admin\/leads\/(\d+)\/status$/)
    if (statusMatch && req.method === 'PATCH') {
      if (!bearerMatches(req.headers.authorization, adminToken)) return json(res, 401, { error: 'unauthorized' })
      const input = await body(req); updateLeadStatus(db, statusMatch[1], String(input.status || ''))
      return json(res, 200, { updated: true })
    }
    if (url.pathname === '/v1/admin/privacy/search' && req.method === 'POST') {
      if (!bearerMatches(req.headers.authorization, adminToken)) return json(res, 401, { error: 'unauthorized' })
      const input = await body(req)
      return json(res, 200, { leads: findDataSubject(db, { email: String(input.email || '').trim().toLowerCase(), whatsapp: String(input.whatsapp || '').replace(/[^+\d]/g, '') }) })
    }
    const deleteMatch = url.pathname.match(/^\/v1\/admin\/leads\/(\d+)$/)
    if (deleteMatch && req.method === 'DELETE') {
      if (!bearerMatches(req.headers.authorization, adminToken)) return json(res, 401, { error: 'unauthorized' })
      deleteLead(db, deleteMatch[1]); return json(res, 200, { deleted: true })
    }
    return json(res, 404, { error: 'not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request'
    const status = message === 'payload too large' ? 413 : 400
    return json(res, status, { error: message })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`rimivo-insights listening on ${port}`))
