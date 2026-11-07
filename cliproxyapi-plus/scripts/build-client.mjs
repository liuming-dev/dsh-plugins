import { build } from 'esbuild'

await build({
  entryPoints: ['editor-codemirror.js'],
  outfile: 'client.editor.js',
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: '__CliproxyYamlEditor',
  platform: 'browser',
  target: ['es2020'],
  legalComments: 'eof',
  footer: {
    js: "window.__ModuleLoader__.load({id:'cliproxyapi-plus/client.editor.js',factory(){return __CliproxyYamlEditor}});",
  },
})
console.log('Built client.editor.js')
