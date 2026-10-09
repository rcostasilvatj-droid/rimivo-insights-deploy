import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX = { site: 32, path: 240, event: 48, source: 120, name: 120, phone: 32, email: 180, product: 80, message: 1200 }
const EVENT_TYPES = new Set(['page_view', 'heartbeat', 'click_contact', 'click_price', 'lead_prompt_view', 'lead_prompt_dismiss'])
const SITES = new Set(['rimivo', 'e-massa', 'entregamanager'])

export function cleanText(value, limit) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function normalizePath(value) {
  const path = cleanText(value, MAX.path)
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  return path.split('?')[0].split('#')[0] || '/'
}

export function normalizeSource(value) {
  const raw = cleanText(value, MAX.source)
  if (!raw) return 'direct'
  try {
    const url = new URL(raw)
    return url.hostname.toLowerCase().slice(0, MAX.source)
  } catch {
    return raw.toLowerCase()
  }
}

export function hashAnonymous(value, secret) {
  const clean = cleanText(value, 128)
  if (!clean || !secret) throw new Error('anonymous identifier unavailable')
  return createHmac('sha256', secret).update(clean).digest('hex')
}

export function validateEvent(input) {
  const site = cleanText(input?.site, MAX.site)
  const type = cleanText(input?.type, MAX.event)
  if (!SITES.has(site)) throw new Error('invalid site')
  if (!EVENT_TYPES.has(type)) throw new Error('invalid event type')
  return {
    site,
    type,
    path: normalizePath(input?.path),
    source: normalizeSource(input?.source),
    product: cleanText(input?.product, MAX.product) || null,
    visitorId: cleanText(input?.visitorId, 128),
    sessionId: cleanText(input?.sessionId, 128),
    durationSeconds: Math.max(0, Math.min(86400, Number(input?.durationSeconds) || 0)),
  }
}

export function validateLead(input) {
  const site = cleanText(input?.site, MAX.site)
  const name = cleanText(input?.name, MAX.name)
  const phone = cleanText(input?.whatsapp, MAX.phone).replace(/[^+\d]/g, '')
  const email = cleanText(input?.email, MAX.email).toLowerCase()
  const product = cleanText(input?.product, MAX.product)
  const consent = input?.consent === true
  if (!SITES.has(site)) throw new Error('invalid site')
  if (name.length < 2) throw new Error('name required')
  if (phone.replace(/\D/g, '').length < 10) throw new Error('valid WhatsApp required')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid email')
  if (!product) throw new Error('product required')
  if (!consent) throw new Error('consent required')
  return {
    site,
    name,
    whatsapp: phone,
    email: email || null,
    product,
    message: cleanText(input?.message, MAX.message) || null,
    path: normalizePath(input?.path),
    source: normalizeSource(input?.source),
    consentVersion: cleanText(input?.consentVersion, 32) || '2026-10-08',
  }
}

export function bearerMatches(header, expected) {
  if (!expected || typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const target = Buffer.from(expected)
  return supplied.length === target.length && timingSafeEqual(supplied, target)
}

export const constants = { EVENT_TYPES, SITES }
