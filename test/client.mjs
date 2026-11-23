// Browser-half regression checks. Zero dependencies: read the client bundle
// source and assert the invariants that previously broke. Run: node test/client.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const src = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8')

let checks = 0
function ok(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label)
  checks++
  console.log('  ok  ' + label)
}

console.log('client.js:')
// bug: module id must equal package name, or client-modules refuses to load.
ok(src.includes(`id: "${pkg.name}"`), 'module id equals package name')
// bug 3: roster request must carry sessionId.
ok(/\?sessionId=\$\{encodeURIComponent\(sessionId\)\}/.test(src), 'fetchRoster sends sessionId')
// bug 4: a freshness window must exist and be consulted.
ok(/ROSTER_TTL_MS\s*=/.test(src), 'roster TTL defined')
ok(/Date\.now\(\)\s*-\s*rosterCache\.at\s*</.test(src), 'roster TTL consulted')
// bug 5: a session without a preset must still render a control.
ok(!/if\s*\(!sessionId\s*\|\|\s*!presetId\)\s*return null/.test(src), 'no early null when preset missing')
ok(/"menu\.pick"/.test(src), 'pick-a-preset label present in both dictionaries')
// Keep the portaled fixed overlay and priority shadowing intact.
ok(/priority:\s*-1/.test(src), 'shadowing priority kept')
ok(/createPortal\(menuNode,\s*document\.body\)/.test(src), 'menu portaled to body')

console.log('package.json:')
ok(pkg.private === undefined, 'not private')
ok(!!pkg.repository && !!pkg.homepage && !!pkg.bugs, 'repository metadata present')
ok(pkg.engines && pkg.engines.node === '>=18', 'engines.node >=18')

console.log(`client.mjs: ${checks} checks passed`)
