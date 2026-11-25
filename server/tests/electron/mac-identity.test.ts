// M17.2: the afterPack hook gives the finished Mac app its own UUIDs, then signs it ad hoc
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
type Run = (cmd: string, args: string[], opts?: unknown) => void;
const hook = require('../../../electron/scripts/mac-identity.js') as ((context: unknown) => Promise<void>) & {
  giveIdentity: (o: { appPath: string; appId: string; version: string; productFilename: string; run?: Run }) => {
    file: string;
    slices: { cputype: number; before: string; after: string }[];
  }[];
  executablesOf: (appPath: string, productFilename: string) => string[];
};

/** A thin arm64 executable whose LC_UUID is sixteen copies of `fill`. */
function executable(fill: number): Buffer {
  const buf = Buffer.alloc(32 + 24 + 16, 0);
  buf.writeUInt32LE(0xfeedfacf, 0);
  buf.writeUInt32LE(0x0100000c, 4);
  buf.writeUInt32LE(2, 12);
  buf.writeUInt32LE(1, 16);
  buf.writeUInt32LE(24, 20);
  buf.writeUInt32LE(0x1b, 32);
  buf.writeUInt32LE(24, 36);
  buf.fill(fill, 40, 56);
  return buf;
}

let dir: string;
let app: string;

/** The parts of an Electron app the hook cares about, and one it must leave alone. */
function makeApp(): void {
  app = join(dir, 'mac-universal', 'HeadlessOS.app');
  const place = (rel: string, content: Buffer) => {
    mkdirSync(join(app, rel, '..'), { recursive: true });
    writeFileSync(join(app, rel), content);
  };
  place('Contents/MacOS/HeadlessOS', executable(0x01));
  for (const helper of ['HeadlessOS Helper', 'HeadlessOS Helper (GPU)', 'HeadlessOS Helper (Renderer)']) {
    place(`Contents/Frameworks/${helper}.app/Contents/MacOS/${helper}`, executable(0x02));
  }
  place('Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework', executable(0x03));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hos-mac-identity-'));
  makeApp();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the Mac app identity hook', () => {
  it('finds the main executable and every helper app, not the framework', () => {
    expect(hook.executablesOf(app, 'HeadlessOS').map((p) => p.split(/[\\/]/).join('/'))).toEqual([
      'Contents/MacOS/HeadlessOS',
      'Contents/Frameworks/HeadlessOS Helper (GPU).app/Contents/MacOS/HeadlessOS Helper (GPU)',
      'Contents/Frameworks/HeadlessOS Helper (Renderer).app/Contents/MacOS/HeadlessOS Helper (Renderer)',
      'Contents/Frameworks/HeadlessOS Helper.app/Contents/MacOS/HeadlessOS Helper',
    ]);
  });

  it('gives each executable its own UUID, then signs and verifies the bundle ad hoc', () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const framework = join(app, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
    const frameworkBefore = readFileSync(framework);
    const changed = hook.giveIdentity({
      appPath: app,
      appId: 'com.headlessos.app',
      version: '0.3.3',
      productFilename: 'HeadlessOS',
      run: (cmd, args) => {
        calls.push({ cmd, args });
      },
    });
    expect(changed).toHaveLength(4);
    const uuids = changed.map((c) => c.slices[0].after);
    expect(new Set(uuids).size).toBe(4);
    for (const c of changed) expect(c.slices[0].after).not.toBe(c.slices[0].before);
    expect(readFileSync(framework).equals(frameworkBefore)).toBe(true);
    expect(calls).toEqual([
      { cmd: 'codesign', args: ['--force', '--deep', '--sign', '-', app] },
      { cmd: 'codesign', args: ['--verify', '--deep', '--strict', app] },
    ]);
  });

  it('gives another version other UUIDs', () => {
    const run: Run = () => {};
    const first = hook.giveIdentity({ appPath: app, appId: 'com.headlessos.app', version: '0.3.3', productFilename: 'HeadlessOS', run });
    makeApp();
    const next = hook.giveIdentity({ appPath: app, appId: 'com.headlessos.app', version: '0.3.4', productFilename: 'HeadlessOS', run });
    expect(next[0].slices[0].after).not.toBe(first[0].slices[0].after);
  });

  it('leaves Windows and Linux builds, and a universal build\'s single-architecture copies, alone', async () => {
    const main = join(app, 'Contents/MacOS/HeadlessOS');
    const before = readFileSync(main);
    const packager = { appInfo: { id: 'com.headlessos.app', version: '0.3.3', productFilename: 'HeadlessOS' } };
    await hook({ electronPlatformName: 'win32', appOutDir: join(dir, 'mac-universal'), packager });
    await hook({ electronPlatformName: 'linux', appOutDir: join(dir, 'mac-universal'), packager });
    await hook({ electronPlatformName: 'darwin', appOutDir: join(dir, 'mac-universal-x64-temp'), packager });
    expect(readFileSync(main).equals(before)).toBe(true);
    expect(existsSync(main)).toBe(true);
  });

  it.skipIf(process.platform === 'darwin')('stops a Mac build where codesign is missing, rather than shipping it unsigned', async () => {
    const packager = { appInfo: { id: 'com.headlessos.app', version: '0.3.3', productFilename: 'HeadlessOS' } };
    await expect(hook({ electronPlatformName: 'darwin', appOutDir: join(dir, 'mac-universal'), packager })).rejects.toThrow(
      /codesign was not found/,
    );
  });
});
