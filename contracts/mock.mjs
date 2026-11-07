// `pnpm mock`: serves the agreed contract plus the drafts in contracts/drafts/ on one Prism mock server.
// Prism reads a single document, so this joins them into a temporary file first. openapi.yaml is never changed.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

const here = dirname(fileURLToPath(import.meta.url))
const contract = parse(readFileSync(join(here, 'openapi.yaml'), 'utf8'))

// Only the mock signs everyone in as a staff member with every role, so each staff screen can be opened.
// Prism would otherwise invent a user, usually a receptionist.
const demoStaff = { id: '6f1c2a10-1d1e-4c3a-9a51-0a0000000001', type: 'STAFF', name: 'Demo Admin', phone: null, email: 'admin@wasla.test', roles: ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'LAB'] }
contract.paths['/auth/login'].post.responses['200'].content['application/json'].example = { token: 'mock-session', expiresAt: '2099-01-01T00:00:00Z', user: demoStaff }
contract.paths['/auth/me'].get.responses['200'].content['application/json'].example = demoStaff

const draftsDir = join(here, 'drafts')
for (const file of readdirSync(draftsDir).filter((f) => f.endsWith('.yaml')).sort()) {
  const raw = readFileSync(join(draftsDir, file), 'utf8')
  // References into the contract become local ones in the joined document.
  const draft = parse(raw.replaceAll("'../openapi.yaml#/", "'#/"))
  for (const [path, item] of Object.entries(draft.paths ?? {})) {
    if (contract.paths[path]) throw new Error(`${file}: ${path} is already in openapi.yaml; delete it from the draft`)
    contract.paths[path] = item
  }
  for (const [section, entries] of Object.entries(draft.components ?? {})) {
    if (section === 'securitySchemes') continue
    contract.components[section] ??= {}
    for (const [name, value] of Object.entries(entries)) {
      if (contract.components[section][name]) throw new Error(`${file}: components.${section}.${name} is already in openapi.yaml`)
      contract.components[section][name] = value
    }
  }
  contract.tags = [...(contract.tags ?? []), ...(draft.tags ?? [])]
}

const joined = join(mkdtempSync(join(tmpdir(), 'wasla-mock-')), 'openapi.yaml')
writeFileSync(joined, stringify(contract))
// Run Prism straight from node (no shell in between), so stopping this script stops the server too.
const prismCli = createRequire(import.meta.url).resolve('@stoplight/prism-cli/dist/index.js')
const prism = spawn(process.execPath, [prismCli, 'mock', joined, '--port', '4010', ...process.argv.slice(2)], { stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => prism.kill())
prism.on('exit', (code) => process.exit(code ?? 0))
