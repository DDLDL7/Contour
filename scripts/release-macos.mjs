import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) throw new Error(`${command} failed; distribution has not been approved.`)
}
try {
  if (process.platform !== 'darwin') throw new Error('Mac distribution must be prepared on macOS.')
  const identity = process.env.APPLE_SIGNING_IDENTITY
  const profile = process.env.CONTOUR_NOTARY_PROFILE
  if (!identity?.startsWith('Developer ID Application:')) throw new Error('Set APPLE_SIGNING_IDENTITY to an installed Developer ID Application identity. An Apple Development identity is not sufficient for this distribution workflow.')
  if (!profile) throw new Error('Set CONTOUR_NOTARY_PROFILE to your existing notarytool keychain profile. Keep credentials in Keychain, not this repository.')
  const identities = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  if (identities.status !== 0 || !identities.stdout.includes(`"${identity}"`)) throw new Error('The requested Developer ID identity is not available in the current keychain.')
  run('xcrun', ['notarytool', 'history', '--keychain-profile', profile, '--output-format', 'json'], { stdio: ['ignore', 'ignore', 'inherit'] })
  if (process.argv.includes('--check')) { console.log('Signing identity and notarisation profile are available. No build or submission performed.'); process.exit(0) }
  run('npm', ['run', 'test:release'])
  run('npm', ['run', 'benchmark'])
  run('npm', ['run', 'desktop:build', '--', '--bundles', 'app'])
  const app = resolve('src-tauri/target/release/bundle/macos/Contour.app')
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  const details = spawnSync('codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' }).stderr
  if (!details.includes(`Authority=${identity}`) || !details.includes('runtime')) throw new Error('The bundle is missing the requested distribution signature or hardened runtime.')
  mkdirSync('release', { recursive: true })
  const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
  const archive = resolve(`release/Contour-${version}-${process.arch}.zip`)
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive])
  run('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', profile, '--wait'])
  run('xcrun', ['stapler', 'staple', app])
  run('xcrun', ['stapler', 'validate', app])
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app])
  // Recreate the deliverable to include the stapled ticket, then hash it.
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive])
  writeFileSync(`${archive}.sha256`, `${createHash('sha256').update(readFileSync(archive)).digest('hex')}  ${archive.split('/').at(-1)}\n`)
  console.log(`Signed, notarised and verified archive: ${archive}`)
} catch (error) { console.error(error.message); process.exitCode = 1 }
