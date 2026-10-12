import fs from 'node:fs/promises';
import JSZip from 'jszip';
const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
const zip = new JSZip();
await fs.mkdir('dist/vault-bridge', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  const content = await fs.readFile(name);
  await fs.writeFile(`dist/vault-bridge/${name}`, content);
  zip.file(`vault-bridge/${name}`, content);
}
await fs.writeFile(`dist/vault-bridge-${manifest.version}.zip`, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Created dist/vault-bridge-${manifest.version}.zip`);
