import fs from 'node:fs/promises';
import JSZip from 'jszip';
const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
const zip = new JSZip();
const folder = `dist/${manifest.id}`;
await fs.mkdir(folder, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  const content = await fs.readFile(name);
  await fs.writeFile(`${folder}/${name}`, content);
  zip.file(`${manifest.id}/${name}`, content);
}
await fs.writeFile(`dist/${manifest.id}-${manifest.version}.zip`, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Created dist/${manifest.id}-${manifest.version}.zip`);
