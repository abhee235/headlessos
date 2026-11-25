// M17.2: the Mac app gets its own UUIDs and an ad hoc signature (ADR-030)
// @see docs/phases/phase-17.md
//
// An electron-builder afterPack hook. It runs on the finished app, before the DMG and zip are made and
// before electron-builder's own signing, which is skipped without an Apple certificate (electron-builder
// 25 can't sign ad hoc). Apple's TN3179 says local network privacy tracks an app by its code signature
// and its main executable's UUID; without this, HeadlessOS has neither of its own.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { rewriteUuids } = require('./macho-uuid');

/** The executables Electron copies into every app: the main one and each helper app's. */
function executablesOf(appPath, productFilename) {
  const frameworks = path.join(appPath, 'Contents', 'Frameworks');
  const helpers = fs
    .readdirSync(frameworks)
    .filter((name) => name.startsWith(`${productFilename} Helper`) && name.endsWith('.app'))
    .sort()
    .map((name) => path.join('Contents', 'Frameworks', name, 'Contents', 'MacOS', name.slice(0, -'.app'.length)));
  return [path.join('Contents', 'MacOS', productFilename), ...helpers];
}

/** Rewrites the UUIDs, then signs the whole bundle ad hoc under its own identifier and checks it. */
function giveIdentity({ appPath, appId, version, productFilename, run = execFileSync, log = () => {} }) {
  const changed = [];
  for (const rel of executablesOf(appPath, productFilename)) {
    const file = path.join(appPath, rel);
    const buf = fs.readFileSync(file);
    const slices = rewriteUuids(buf, `${appId}\0${version}\0${rel.split(path.sep).join('/')}`);
    fs.writeFileSync(file, buf);
    changed.push({ file: rel, slices });
    log(`new UUIDs for ${rel}: ${slices.map((s) => s.after).join(', ')}`);
  }
  try {
    // --deep signs the helpers and frameworks first, then the app, each under its bundle's identifier.
    run('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    run('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  } catch (err) {
    if (err && err.code === 'ENOENT') throw new Error('codesign was not found: a Mac build has to run on macOS');
    throw err;
  }
  log(`signed ad hoc: ${appPath}`);
  return changed;
}

/** electron-builder's afterPack hook. */
async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // The single-architecture copies a universal build makes first, and then merges.
  if (/-temp$/.test(context.appOutDir)) return;
  const { appInfo } = context.packager;
  giveIdentity({
    appPath: path.join(context.appOutDir, `${appInfo.productFilename}.app`),
    appId: appInfo.id,
    version: appInfo.version,
    productFilename: appInfo.productFilename,
    log: (line) => console.log(`  • ${line}`),
  });
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.giveIdentity = giveIdentity;
module.exports.executablesOf = executablesOf;
