// M16.1: when the install secret is out of reach, nothing may turn locked into lost
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const env = vi.hoisted(() => ({ home: '' }));

vi.mock('os', async (orig) => {
  const actual = await orig<typeof import('os')>();
  env.home = `${actual.tmpdir()}/hos-locked-${process.pid}-${Date.now()}`;
  return { ...actual, homedir: () => env.home };
});

const dataDir = () => join(env.home, '.headlessos');
const keyFile = () => join(dataDir(), 'enc-key');
const keychainFile = () => join(dataDir(), 'enc-key.keychain');
const SECRET = 'd'.repeat(64);

/** A fresh module: the secret is cached for the life of the process */
async function load() {
  vi.resetModules();
  return import('../../src/security/encryption.js');
}

async function openStore(dir: string) {
  const { ConfigStore } = await import('../../src/config/store.js');
  const store = new ConfigStore('locked-test', dir);
  await store.construct({} as never);
  return store;
}

beforeEach(() => {
  delete process.env.HEADLESSOS_INSTALL_SECRET;
  rmSync(dataDir(), { recursive: true, force: true });
  mkdirSync(dataDir(), { recursive: true });
});

afterAll(() => rmSync(env.home, { recursive: true, force: true }));

describe('the install secret', () => {
  it('comes from the desktop app when it is handed over, and leaves the environment', async () => {
    process.env.HEADLESSOS_INSTALL_SECRET = SECRET;
    const { encrypt, decrypt, loginsLocked } = await load();

    expect(decrypt(encrypt('battery staple'))).toBe('battery staple');
    expect(loginsLocked()).toBe(false);
    expect(process.env.HEADLESSOS_INSTALL_SECRET).toBeUndefined();
    expect(existsSync(keyFile())).toBe(false);
  });

  it('opens what the same secret encrypted in the plain file', async () => {
    writeFileSync(keyFile(), SECRET);
    const sealed = (await load()).encrypt('battery staple');

    rmSync(keyFile());
    writeFileSync(keychainFile(), 'wrapped');
    process.env.HEADLESSOS_INSTALL_SECRET = SECRET;

    expect((await load()).decrypt(sealed)).toBe('battery staple');
  });

  it('is locked when it is in the keychain and was not handed over', async () => {
    writeFileSync(keychainFile(), 'wrapped');
    const { encrypt, LoginsLockedError, loginsLocked, secretStore } = await load();

    expect(loginsLocked()).toBe(true);
    expect(secretStore()).toBe('locked');
    expect(() => encrypt('x')).toThrow(LoginsLockedError);
  });

  it('never makes a new secret while locked, which would orphan every saved login', async () => {
    writeFileSync(keychainFile(), 'wrapped');
    const { loginsLocked } = await load();
    loginsLocked();
    expect(existsSync(keyFile())).toBe(false);
  });

  it('still makes one on a new install', async () => {
    const { encrypt, secretStore } = await load();
    encrypt('x');
    expect(existsSync(keyFile())).toBe(true);
    expect(secretStore()).toBe('file');
  });

  it('reports where it is held', async () => {
    writeFileSync(keychainFile(), 'wrapped');
    process.env.HEADLESSOS_INSTALL_SECRET = SECRET;
    expect((await load()).secretStore()).toBe('keychain');
  });
});

describe('the server list while locked', () => {
  const server = { name: 'pi', host: '192.168.1.20', port: 22, username: 'pi', authMethod: 'password' as const };
  let file: string;
  let dir: string;
  let sealed: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(env.home, 'list-'));
    file = join(dir, 'servers.json');
    writeFileSync(keyFile(), SECRET);
    sealed = (await load()).encrypt('battery staple');
    writeFileSync(file, JSON.stringify([{ ...server, id: 's1', password: sealed }]));

    rmSync(keyFile());
    writeFileSync(keychainFile(), 'wrapped');
    vi.resetModules();
  });

  it('keeps the server, with its login out of memory', async () => {
    const store = await openStore(dir);
    expect((await store.getServer('s1'))?.host).toBe('192.168.1.20');
    expect((await store.getServer('s1'))?.password).toBeUndefined();
  });

  it('does not touch the file on loading', async () => {
    const before = readFileSync(file, 'utf8');
    await openStore(dir);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('keeps the stored login through a save', async () => {
    const store = await openStore(dir);
    await store.addServer({ ...server, name: 'no secret', authMethod: 'agent' });
    expect(JSON.parse(readFileSync(file, 'utf8'))[0].password).toBe(sealed);
  });

  it('refuses a new password, and leaves the list as it was', async () => {
    const store = await openStore(dir);
    await expect(store.addServer({ ...server, name: 'new', password: 'x' })).rejects.toThrow(/locked/);
    expect(await store.getServers()).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  it('opens the login again once the secret is back', async () => {
    await openStore(dir);
    vi.resetModules();
    process.env.HEADLESSOS_INSTALL_SECRET = SECRET;
    expect((await (await openStore(dir)).getServer('s1'))?.password).toBe('battery staple');
  });
});
