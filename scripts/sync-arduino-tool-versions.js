// @ts-check
/**
 * Met à jour les versions des outils Arduino embarqués (arduino-cli, fwuploader,
 * language-server, clangd) et les plugins Theia Arduino depuis une référence
 * upstream Git (ex. upstream/main).
 *
 * Usage :
 *   node scripts/sync-arduino-tool-versions.js
 *   UPSTREAM_REF=upstream/2.3.x node scripts/sync-arduino-tool-versions.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const upstreamRef = process.env.UPSTREAM_REF || 'upstream/main';

function gitShow(filePath) {
  try {
    return execFileSync('git', ['show', `${upstreamRef}:${filePath}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    console.error(
      `Impossible de lire ${upstreamRef}:${filePath}. Lancez d'abord : git fetch upstream`
    );
    throw err;
  }
}

function readJsonFromGit(filePath) {
  return JSON.parse(gitShow(filePath));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function mergeArduinoSection(localPkg, upstreamPkg) {
  if (!upstreamPkg.arduino) {
    console.warn('  Aucune section "arduino" dans le package.json upstream.');
    return false;
  }
  const before = JSON.stringify(localPkg.arduino ?? {});
  localPkg.arduino = upstreamPkg.arduino;
  return before !== JSON.stringify(localPkg.arduino);
}

function mergeTheiaPlugins(localElectronPkg, upstreamElectronPkg) {
  const arduinoPluginPrefixes = [
    'vscode-arduino-api',
    'vscode-arduino-tools',
    'cortex-debug',
  ];
  let changed = false;
  if (!upstreamElectronPkg.theiaPlugins) {
    return false;
  }
  localElectronPkg.theiaPlugins = localElectronPkg.theiaPlugins ?? {};
  for (const key of arduinoPluginPrefixes) {
    if (upstreamElectronPkg.theiaPlugins[key] === undefined) {
      continue;
    }
    if (localElectronPkg.theiaPlugins[key] !== upstreamElectronPkg.theiaPlugins[key]) {
      localElectronPkg.theiaPlugins[key] = upstreamElectronPkg.theiaPlugins[key];
      changed = true;
      console.log(`  theiaPlugins.${key} -> ${upstreamElectronPkg.theiaPlugins[key]}`);
    }
  }
  return changed;
}

function syncVersionsFromUpstream(rootVersion) {
  const targets = [
    path.join(repoRoot, 'package.json'),
    path.join(repoRoot, 'electron-app', 'package.json'),
    path.join(repoRoot, 'arduino-ide-extension', 'package.json'),
  ];
  let changed = false;
  for (const pkgPath of targets) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let fileChanged = false;
    if (pkg.version !== rootVersion) {
      console.log(`  ${path.relative(repoRoot, pkgPath)} version ${pkg.version} -> ${rootVersion}`);
      pkg.version = rootVersion;
      fileChanged = true;
    }
    if (pkg.dependencies) {
      for (const dep of Object.keys(pkg.dependencies)) {
        if (dep.startsWith('arduino-ide-') && pkg.dependencies[dep] !== rootVersion) {
          pkg.dependencies[dep] = rootVersion;
          fileChanged = true;
        }
      }
    }
    if (fileChanged) {
      writeJson(pkgPath, pkg);
      changed = true;
    }
  }
  return changed;
}

function main() {
  console.log(`>>> Lecture des versions depuis ${upstreamRef}`);

  const upstreamRoot = readJsonFromGit('package.json');
  const upstreamExtension = readJsonFromGit('arduino-ide-extension/package.json');
  const upstreamElectron = readJsonFromGit('electron-app/package.json');

  console.log(`>>> Version IDE upstream : ${upstreamRoot.version}`);
  if (upstreamExtension.arduino) {
    const { arduino } = upstreamExtension;
    console.log('>>> Outils Arduino upstream :');
    if (arduino['arduino-cli']) {
      console.log(`    arduino-cli: ${arduino['arduino-cli'].version}`);
    }
    if (arduino['arduino-fwuploader']) {
      console.log(`    arduino-fwuploader: ${arduino['arduino-fwuploader'].version}`);
    }
    if (arduino['arduino-language-server']) {
      const ls = arduino['arduino-language-server'].version;
      console.log(
        `    arduino-language-server: ${
          typeof ls === 'string' ? ls : `${ls.owner}/${ls.repo}@${ls.commitish}`
        }`
      );
    }
    if (arduino.clangd) {
      console.log(`    clangd: ${arduino.clangd.version}`);
    }
  }

  const extensionPath = path.join(repoRoot, 'arduino-ide-extension', 'package.json');
  const electronPath = path.join(repoRoot, 'electron-app', 'package.json');

  const extensionPkg = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));
  const electronPkg = JSON.parse(fs.readFileSync(electronPath, 'utf8'));

  let anyChange = false;

  console.log('>>> Mise à jour de arduino-ide-extension/package.json (section arduino)');
  if (mergeArduinoSection(extensionPkg, upstreamExtension)) {
    anyChange = true;
    writeJson(extensionPath, extensionPkg);
    console.log('  Section "arduino" mise à jour.');
  } else {
    console.log('  Section "arduino" déjà à jour.');
  }

  console.log('>>> Mise à jour des plugins Arduino dans electron-app/package.json');
  if (mergeTheiaPlugins(electronPkg, upstreamElectron)) {
    anyChange = true;
    writeJson(electronPath, electronPkg);
  } else {
    console.log('  Plugins Arduino déjà à jour.');
  }

  if (process.env.SYNC_IDE_VERSION === '1') {
    console.log('>>> Alignement des numéros de version IDE (SYNC_IDE_VERSION=1)');
    if (syncVersionsFromUpstream(upstreamRoot.version)) {
      anyChange = true;
    }
  }

  if (!anyChange) {
    console.log('>>> Aucun changement de version détecté.');
  } else {
    console.log('>>> Fichiers package.json modifiés. Relancez : yarn prepare');
  }
}

main();
