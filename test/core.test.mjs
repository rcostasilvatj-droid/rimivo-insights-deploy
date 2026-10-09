import test from 'node:test'
import assert from 'node:assert/strict'
import { bearerMatches, hashAnonymous, normalizePath, normalizeSource, validateEvent, validateLead } from '../src/core.mjs'

test('analytics removes query and fragment from paths', () => assert.equal(normalizePath('/produto?email=x#preco'), '/produto'))
test('referrer stores only hostname', () => assert.equal(normalizeSource('https://www.google.com/search?q=nome'), 'www.google.com'))
test('anonymous ids are one-way and stable', () => {
  const a = hashAnonymous('visitor-1', 'a'.repeat(32))
  assert.equal(a, hashAnonymous('visitor-1', 'a'.repeat(32)))
  assert.notEqual(a, hashAnonymous('visitor-2', 'a'.repeat(32)))
  assert.equal(a.length, 64)
})
test('event allowlist rejects arbitrary telemetry', () => {
  assert.throws(() => validateEvent({ site: 'rimivo', type: 'keystroke' }), /invalid event type/)
})
test('lead requires consent and validates contact data', () => {
  assert.throws(() => validateLead({ site: 'rimivo', name: 'Ana', whatsapp: '11999999999', product: 'É Massa' }), /consent required/)
  const lead = validateLead({ site: 'rimivo', name: ' Ana ', whatsapp: '(11) 99999-9999', email: 'ANA@EXAMPLE.COM', product: 'É Massa', consent: true })
  assert.equal(lead.whatsapp, '11999999999')
  assert.equal(lead.email, 'ana@example.com')
})
test('admin bearer comparison is exact', () => {
  assert.equal(bearerMatches('Bearer secret-value', 'secret-value'), true)
  assert.equal(bearerMatches('Bearer wrong', 'secret-value'), false)
})
