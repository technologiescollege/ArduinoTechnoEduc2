//@ts-check
/**
 * Copy Arduino binaries from src/node/resources to lib/node/resources after tsc.
 * Without this, a fresh `yarn build` leaves the daemon unable to find arduino-cli
 * until webpack (electron-app) runs and copies them again.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'node', 'resources');
const destDir = path.join(__dirname, '..', 'lib', 'node', 'resources');

const binaries = [
  'arduino-cli',
  'arduino-fwuploader',
  'arduino-language-server',
  'clangd',
  'clang-format',
];

if (process.platform === 'win32') {
  for (let i = 0; i < binaries.length; i++) {
    binaries[i] += '.exe';
  }
}

fs.mkdirSync(destDir, { recursive: true });

for (const name of binaries) {
  const from = path.join(srcDir, name);
  const to = path.join(destDir, name);
  if (!fs.existsSync(from)) {
    console.warn(`copy-resources: missing ${from} (run yarn download-cli / download-ls first)`);
    continue;
  }
  fs.copyFileSync(from, to);
  fs.chmodSync(to, 0o755);
  console.log(`copy-resources: ${name}`);
}
