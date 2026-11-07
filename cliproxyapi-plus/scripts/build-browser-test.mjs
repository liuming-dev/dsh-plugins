import { build } from 'esbuild'

await build({
  entryPoints: ['test/browser/harness-entry.js'],
  outfile: 'test/browser/harness.js',
  bundle: true,
  minify: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  legalComments: 'eof',
})
console.log('Built test/browser/harness.js')
