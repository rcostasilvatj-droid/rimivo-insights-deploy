import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findDataSubject, insertEvent, insertLead, listLeads, openDatabase, updateLeadStatus, weeklyReport } from '../src/db.mjs'

test('report separates sites and counts anonymous visitors without personal data', () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'rimivo-insights-')), 'test.db'))
  insertEvent(db, { site: 'rimivo', type: 'page_view', path: '/', source: 'direct', product: null, durationSeconds: 0 }, 'visitor-a', 'session-a')
  insertEvent(db, { site: 'rimivo', type: 'heartbeat', path: '/', source: 'direct', product: null, durationSeconds: 20 }, 'visitor-a', 'session-a')
  insertEvent(db, { site: 'rimivo', type: 'heartbeat', path: '/', source: 'direct', product: null, durationSeconds: 40 }, 'visitor-a', 'session-a')
  insertEvent(db, { site: 'e-massa', type: 'page_view', path: '/', source: 'direct', product: 'É Massa Delivery', durationSeconds: 0 }, 'visitor-b', 'session-b')
  const leadId = insertLead(db, { site: 'rimivo', name: 'Ana', whatsapp: '11999999999', email: 'ana@example.com', product: 'É Massa Delivery', message: null, path: '/', source: 'direct', consentVersion: '2026-10-08' })
  const report = weeklyReport(db, 'rimivo', 7)
  assert.equal(report.totals.pageViews, 1)
  assert.equal(report.totals.uniqueVisitors, 1)
  assert.equal(report.averageSeconds, 40)
  assert.equal(report.leads.total, 1)
  assert.equal(report.activeVisitors, 1)
  updateLeadStatus(db, leadId, 'CONTATADO')
  assert.equal(listLeads(db, { status: 'CONTATADO' })[0].status, 'CONTATADO')
  assert.equal(findDataSubject(db, { email: 'ana@example.com' })[0].id, leadId)
  db.close()
})
