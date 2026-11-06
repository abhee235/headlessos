// M15.12: credentials are encrypted at rest, and a failure to read them never loses the server list
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigStore } from '../../src/config/store.js';
import { isEncrypted } from '../../src/security/encryption.js';
import type { ServerConfig } from 'headlessos-shared';

const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----';

const server: Omit<ServerConfig, 'id'> = {
  name: 'pi',
  host: '192.168.1.20',
  port: 22,
  username: 'pi',
  authMethod: 'privateKey',
  privateKeyPath: KEY,
  passphrase: 'correct horse',
  password: 'battery staple',
};

let dir: string;
let file: string;

async function open(): Promise<ConfigStore> {
  const store = new ConfigStore('config-test', dir);
  await store.construct({} as never);
  return store;
}

const onDisk = async () => JSON.parse(await readFile(file, 'utf-8')) as ServerConfig[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'config-store-'));
  file = join(dir, 'servers.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('secrets at rest', () => {
  it('writes no password, key or passphrase in plain text', async () => {
    const store = await open();
    await store.addServer(server);

    const text = await readFile(file, 'utf-8');
    expect(text).not.toContain('PRIVATE KEY');
    expect(text).not.toContain('b3BlbnNzaC1rZXkt');
    expect(text).not.toContain('correct horse');
    expect(text).not.toContain('battery staple');

    const [saved] = await onDisk();
    expect(isEncrypted(saved!.privateKeyPath!)).toBe(true);
    expect(isEncrypted(saved!.passphrase!)).toBe(true);
    expect(isEncrypted(saved!.password!)).toBe(true);
  });

  it('gives them back in full after a restart', async () => {
    const first = await open();
    const { id } = await first.addServer(server);

    const second = await open();
    const loaded = await second.getServer(id);
    expect(loaded?.privateKeyPath).toBe(KEY);
    expect(loaded?.passphrase).toBe('correct horse');
    expect(loaded?.password).toBe('battery staple');
  });

  it('encrypts a key left in plain text by an older version', async () => {
    await writeFile(file, JSON.stringify([{ ...server, id: 'old', password: undefined, passphrase: undefined }]));

    const store = await open();
    expect((await store.getServer('old'))?.privateKeyPath).toBe(KEY);
    expect(await readFile(file, 'utf-8')).not.toContain('PRIVATE KEY');
  });
});

describe('a file it cannot fully read', () => {
  it('keeps the server when one secret cannot be decrypted', async () => {
    const first = await open();
    const { id } = await first.addServer({ ...server, privateKeyPath: undefined, passphrase: undefined });

    // What a changed machine key looks like: the prefix is there, the content no longer opens
    const [saved] = await onDisk();
    await writeFile(file, JSON.stringify([{ ...saved, password: `${saved!.password!.slice(0, -4)}0000` }]));

    const second = await open();
    const loaded = await second.getServer(id);
    expect(loaded?.host).toBe('192.168.1.20');
    expect(loaded?.password).toBeUndefined();

    await second.addServer({ ...server, name: 'second' });
    expect((await onDisk()).map((s) => s.name)).toEqual(['pi', 'second']);
  });

  it('moves a broken file aside instead of saving over it', async () => {
    await writeFile(file, '{ not json');

    const store = await open();
    expect(await store.getServers()).toEqual([]);
    expect(await readFile(`${file}.broken`, 'utf-8')).toBe('{ not json');

    await store.addServer(server);
    expect(existsSync(`${file}.broken`)).toBe(true);
  });

  it('starts empty when there is no file yet', async () => {
    expect(await (await open()).getServers()).toEqual([]);
    expect(existsSync(`${file}.broken`)).toBe(false);
  });
});
