// Host-half regression checks. Zero dependencies: read the source and assert
// the invariants that previously broke. Run: node test/config.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = fs.readFileSync(path.join(ROOT, 'lib/index.js'), 'utf8')

let checks = 0
function ok(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label)
  checks++
  console.log('  ok  ' + label)
}

console.log('index.js:')
// bug 8: Config fields must be volatile, and the legacy settings namespace
// registration (which throws on hot reload) must be gone.
ok(/\benabled:\s*z\.boolean\(\)\.default\(true\)\.volatile\(\)/.test(src), 'config.enabled is volatile')
ok(/syncDefault:\s*z\.boolean\(\)\.default\(false\)\.volatile\(\)/.test(src), 'config.syncDefault defaults false & volatile')
ok(!/settings\.register\s*\(/.test(src), 'no legacy settings.register')
ok(/typeof value\.get === "function"/.test(src) || /typeof value\.get === 'function'/.test(src), 'live volatile reads via .get()')
ok(/enabledNow\(\)/.test(src) && /syncDefaultNow\(\)/.test(src), 'volatile values read at use sites')
// The switch engine and loopback guard must stay intact.
ok(/presets\.recompose\(agent\.ctx,\s*presetId\)/.test(src), 'switch uses presets.recompose')
ok(/agent-preset\/selected/.test(src), 'switch records agent-preset/selected')
ok(/guardLocal\(req\)/.test(src), 'loopback guard present')
ok(/kind:\s*"prefix"/.test(src), 'HTTP api registered as prefix route')
ok(/AGENT_PRESET_NS\s*=\s*"agent-preset-registry"/.test(src), 'writes registry selectedDefault namespace')
ok(/enabled:\s*enabledNow\(\)/.test(src), 'list body exposes enabled')
ok(/readVolatile\(config\?\.syncDefault,\s*false\)/.test(src), 'syncDefault fallback false')

console.log(`config.mjs: ${checks} checks passed`)
