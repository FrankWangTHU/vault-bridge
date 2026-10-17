import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import { bundledLicenses } from './scripts/licenses.mjs';
const options = {
  entryPoints: ['src/main.ts'], bundle: true, outfile: 'main.js',
  format: 'cjs', platform: 'node', target: 'es2020',
  external: ['obsidian', 'electron'], sourcemap: false,
  banner: { js: '/* VaultBridge | MIT | Yanlu Wang */' },
  metafile: true,
  plugins: [{ name: 'bundled-licenses', setup(build) {
    build.onEnd(async result => {
      if (result.errors.length) return;
      const notices = await bundledLicenses(result.metafile.inputs);
      await fs.writeFile('THIRD_PARTY_NOTICES.md', notices);
      await fs.appendFile('main.js', `\n/*\n${notices.replaceAll('*/', '* /')}\n*/\n`);
    });
  } }],
};
if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
} else await esbuild.build(options);
