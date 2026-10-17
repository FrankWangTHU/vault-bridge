import fs from 'node:fs/promises';
import path from 'node:path';

// Keep dependency attribution in main.js, which the community installer downloads.
export async function bundledLicenses(inputs) {
  const packages = new Map();
  for (const input of Object.keys(inputs)) {
    if (!input.replaceAll('\\', '/').includes('node_modules/')) continue;
    let directory = path.dirname(path.resolve(input));
    while (directory !== path.dirname(directory)) {
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
        if (pkg.name && pkg.version) {
          const key = `${pkg.name}@${pkg.version}`;
          if (!packages.has(key)) {
            const files = (await fs.readdir(directory)).filter(file => /^(?:licen[cs]e|copying)(?:\..*)?$/i.test(file));
            if (!files.length) throw new Error(`Missing bundled license for ${key}`);
            const licenses = await Promise.all(files.map(file => fs.readFile(path.join(directory, file), 'utf8')));
            packages.set(key, licenses.join('\n\n').trim());
          }
          break;
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      directory = path.dirname(directory);
    }
  }
  return '# Third-party notices\n\nLicenses for dependencies bundled in VaultBridge.\n\n' + [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, license]) => `## ${name}\n\n${license}\n`).join('\n');
}
