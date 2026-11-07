import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigFile, expandHome, parseYaml, serverSummary } from '../config-file.js'

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'cliproxyapi-plus-config-'))
  const path = join(directory, 'config.yaml')
  return { directory, path }
}

test('home expansion accepts absolute paths and rejects relative paths', () => {
  assert.equal(expandHome('~/config.yaml', '/home/test'), '/home/test/config.yaml')
  assert.equal(expandHome('~', '/home/test'), '/home/test')
  assert.equal(expandHome(' /tmp/config.yaml '), '/tmp/config.yaml')
  for (const value of ['', 'relative.yaml', '~other/file']) assert.throws(() => expandHome(value, '/home/test'), /路径/)
})

test('YAML parsing and server derivation support v8 and legacy shapes', () => {
  const config = parseYaml('config-version: 8\nserver:\n  host: 0.0.0.0\n  port: 9000\noauth:\n  auth-dir: ~/auth\naccess:\n  api-keys: [one, two]\n')
  assert.deepEqual(serverSummary(config), {
    host: '0.0.0.0', port: 9000, baseUrl: 'http://127.0.0.1:9000',
    managementUrl: 'http://127.0.0.1:9000/management.html', authDir: '~/auth', apiKeyCount: 2, configVersion: 8,
  })
  assert.equal(serverSummary({ port: 1234 }).port, 1234)
  assert.equal(serverSummary({ server: { host: '::1', port: 2 } }).baseUrl, 'http://[::1]:2')
  assert.deepEqual(parseYaml(''), {})
  assert.throws(() => parseYaml('[1, 2]'), /顶层/)
  assert.throws(() => parseYaml('a: [broken'), error => error.code === 'invalid-yaml')
  assert.throws(() => parseYaml('a: 1\na: 2'), /unique|重复|Map keys/i)
})

test('read reports missing files and preserves YAML source', async () => {
  const { path } = await fixture()
  const file = new ConfigFile(path)
  await assert.rejects(file.read(), error => error.code === 'config-not-found')
  const source = '# keep this comment\nserver:\n  port: 8317\n'
  await writeFile(path, source, { mode: 0o640 })
  const result = await file.read()
  assert.equal(result.text, source)
  assert.equal(result.server.port, 8317)
  assert.equal(result.ok, true)
})

test('atomic save validates, preserves comments and mode, and writes backup', async () => {
  const { path } = await fixture()
  const file = new ConfigFile(path)
  const first = await file.save({ text: '# first\nserver:\n  port: 1\n' })
  assert.equal(first.saved, true)
  assert.equal(first.backupPath, undefined)
  await stat(path)
  const original = await file.read()
  const second = await file.save({ text: '# second\nserver:\n  port: 2\n', expectedMtimeMs: original.mtimeMs })
  assert.equal(second.server.port, 2)
  assert.equal(await readFile(`${path}.bak`, 'utf8'), '# first\nserver:\n  port: 1\n')
  assert.match(await readFile(path, 'utf8'), /# second/)
  await assert.rejects(file.save({ text: 'broken: [', expectedMtimeMs: second.mtimeMs }), error => error.code === 'invalid-yaml')
  assert.match(await readFile(path, 'utf8'), /# second/)
})

test('external modification requires explicit overwrite', async () => {
  const { path } = await fixture()
  const file = new ConfigFile(path)
  const original = await file.save({ text: 'server: {port: 1}\n' })
  await new Promise(resolve => setTimeout(resolve, 5))
  await writeFile(path, 'server: {port: 9}\n')
  await assert.rejects(file.save({ text: 'server: {port: 2}\n', expectedMtimeMs: original.mtimeMs }), error => error.code === 'config-conflict')
  const overwritten = await file.save({ text: 'server: {port: 2}\n', expectedMtimeMs: original.mtimeMs, overwrite: true })
  assert.equal(overwritten.server.port, 2)
})

test('symlink configuration files are not replaced', async () => {
  const { directory, path } = await fixture()
  const target = join(directory, 'target.yaml')
  await writeFile(target, 'server: {port: 1}\n')
  await symlink(target, path)
  await assert.rejects(new ConfigFile(path).save({ text: 'server: {port: 2}\n' }), error => error.code === 'unsafe-config-path')
  assert.equal(await readFile(target, 'utf8'), 'server: {port: 1}\n')
})
