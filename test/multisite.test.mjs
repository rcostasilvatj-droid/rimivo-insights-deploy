import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEvent, validateLead, constants } from '../src/core.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { insertEvent, insertLead, openDatabase, weeklyReport } from '../src/db.mjs'

test('somente as três vitrines comerciais são aceitas', () => {
  assert.deepEqual([...constants.SITES].sort(), ['e-massa', 'entregamanager', 'rimivo'])
  for (const site of constants.SITES) {
    assert.equal(validateEvent({ site, type: 'page_view', path: '/?query=pessoal', visitorId: 'v', sessionId: 's' }).site, site)
    assert.equal(validateLead({ site, name: 'Teste válido', whatsapp: '11999999999', product: 'Produto', consent: true }).site, site)
  }
  for (const site of ['app.emassadelivery.com.br', 'app.entregamanager.com.br', 'other', '']) {
    assert.throws(() => validateEvent({ site, type: 'page_view' }), /invalid site/)
    assert.throws(() => validateLead({ site, name: 'Xyz', whatsapp: '11999999999', product: 'Produto', consent: true }), /invalid site/)
  }
})

test('relatórios não misturam leads nem eventos de domínios comerciais', () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'rimivo-multisite-')), 'test.db'))
  try {
    const event = (site, visitor) => insertEvent(db,
      { site, type: 'page_view', path: '/', source: 'direct', product: site, durationSeconds: 0 },
      visitor, visitor + '-session')
    event('rimivo', 'visitor-1')
    event('e-massa', 'visitor-2')
    event('entregamanager', 'visitor-3')
    insertLead(db, {
      site: 'entregamanager', name: 'Contato Exemplo', whatsapp: '11999999999',
      email: null, product: 'EntregaManager', message: null,
      path: '/', source: 'direct', consentVersion: '2026-10-09'
    })
    for (const site of ['rimivo', 'e-massa', 'entregamanager']) {
      const report = weeklyReport(db, site, 7)
      assert.equal(report.totals.pageViews, 1)
      assert.equal(report.totals.uniqueVisitors, 1)
      assert.equal(report.leads.total, site === 'entregamanager' ? 1 : 0)
    }
  } finally {
    db.close()
  }
})
