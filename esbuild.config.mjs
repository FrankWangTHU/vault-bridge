import * as esbuild from 'esbuild';
const options = {
  entryPoints: ['src/main.ts'], bundle: true, outfile: 'main.js',
  format: 'cjs', platform: 'node', target: 'es2020',
  external: ['obsidian', 'electron'], sourcemap: false,
  banner: { js: '/* VaultBridge | MIT | Yanlu Wang */' },
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else await esbuild.build(options);
