// M15.18: saved secrets don't depend on the computer's name (ADR-028)
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createCipheriv, randomBytes, scryptSync } from 'crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const env = vi.hoisted(() => ({ name: 'macbook.local', home: '' }));

vi.mock('os', async (orig) => {
  const actual = await orig<typeof import('os')>();
  env.home = actual.tmpdir() + `/hos-enc-${process.pid}-${Date.now()}`;
  return { ...actual, hostname: () => env.name, homedir: () => env.home };
});

import { userInfo } from 'os';
import { ConfigStore } from '../../src/config/store.js';
import { decrypt, encrypt, isCurrentEncryption, isEncrypted } from '../../src/security/encryption.js';
import { loadLLMSettings } from '../../src/llm/llm-settings-store.js';

const SALT = 'headlessos-credential-salt-v1';

/** A value as M15.17 and earlier wrote it: `enc:` with the hostname in the key */
function savedBeforeM1518(plain: string): string {
  const secret = readFileSync(join(env.home, '.headlessos', 'enc-key'), 'utf8').trim();
  const key = scryptSync(`${secret}:${env.name}:${userInfo().uid}:${SALT}`, SALT, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const body = cipher.update(plain, 'utf8', 'hex') + cipher.final('hex');
  return `enc:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${body}`;
}

const scratch = () => {
  const dir = mkdtempSync(join(env.home, 'case-'));
  return { dir, servers: join(dir, 'servers.json'), llm: join(dir, 'llm.json') };
};

const server = (password: string) => ({
  id: 's1', name: 'pi', host: '192.168.1.20', port: 22, username: 'pi', authMethod: 'password', password,
});

async function open(dir: string): Promise<ConfigStore> {
  const store = new ConfigStore('config-test', dir);
  await store.construct({} as never);
  return store;
}

beforeEach(() => {
  env.name = 'macbook.local';
  mkdirSync(join(env.home, '.headlessos'), { recursive: true });
  encrypt('create the install secret');
});

afterAll(() => rmSync(env.home, { recursive: true, force: true }));

describe('saved secrets and the computer name', () => {
  it('opens a new value after the name changes', () => {
    const saved = encrypt('battery staple');
    env.name = 'dhcp-10-0-0-7.cafe-wifi';
    expect(decrypt(saved)).toBe('battery staple');
  });

  it('marks new values as current, and older ones and plain text as not', () => {
    expect(isCurrentEncryption(encrypt('x'))).toBe(true);
    const older = savedBeforeM1518('x');
    expect(isEncrypted(older)).toBe(true);
    expect(isCurrentEncryption(older)).toBe(false);
    expect(isCurrentEncryption('plain text')).toBe(false);
  });

  it('still opens a value saved before the change', () => {
    expect(decrypt(savedBeforeM1518('battery staple'))).toBe('battery staple');
  });

  it('moves saved passwords to the current key at startup, so a later rename loses nothing', async () => {
    const { dir, servers } = scratch();
    writeFileSync(servers, JSON.stringify([server(savedBeforeM1518('battery staple'))]));

    await open(dir);
    const moved = JSON.parse(readFileSync(servers, 'utf8'))[0].password as string;
    expect(isCurrentEncryption(moved)).toBe(true);

    env.name = 'dhcp-10-0-0-7.cafe-wifi';
    expect((await open(dir)).findServer('s1')?.password).toBe('battery staple');
  });

  it('leaves an unreadable password in the file, so the right name can still open it', async () => {
    const { dir, servers } = scratch();
    const older = savedBeforeM1518('battery staple');
    writeFileSync(servers, JSON.stringify([server(older)]));

    env.name = 'dhcp-10-0-0-7.cafe-wifi';
    const store = await open(dir);
    expect(store.findServer('s1')?.password).toBeUndefined();
    expect(JSON.parse(readFileSync(servers, 'utf8'))[0].password).toBe(older);

    env.name = 'macbook.local';
    expect((await open(dir)).findServer('s1')?.password).toBe('battery staple');
  });

  it('moves saved AI keys too, and keeps the rest of the file', () => {
    const { llm } = scratch();
    writeFileSync(llm, JSON.stringify({
      provider: 'anthropic',
      model: 'gpt-4.1',
      apiKey: savedBeforeM1518('sk-openai'),
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' },
      anthropic: { model: 'claude-opus-5-5', apiKey: savedBeforeM1518('sk-claude') },
    }));

    expect(loadLLMSettings(llm)).toMatchObject({ apiKey: 'sk-openai', anthropic: { apiKey: 'sk-claude' } });

    const file = JSON.parse(readFileSync(llm, 'utf8'));
    expect(isCurrentEncryption(file.apiKey)).toBe(true);
    expect(isCurrentEncryption(file.anthropic.apiKey)).toBe(true);
    expect(file).toMatchObject({
      provider: 'anthropic',
      model: 'gpt-4.1',
      ollama: { model: 'qwen3:8b' },
      anthropic: { model: 'claude-opus-5-5' },
    });

    env.name = 'dhcp-10-0-0-7.cafe-wifi';
    expect(loadLLMSettings(llm)).toMatchObject({ apiKey: 'sk-openai', anthropic: { apiKey: 'sk-claude' } });
  });

  it('does not rewrite an AI settings file that is already current', () => {
    const { llm } = scratch();
    const body = JSON.stringify({ provider: 'openai', model: 'gpt-4.1', apiKey: encrypt('sk-openai') });
    writeFileSync(llm, body);
    loadLLMSettings(llm);
    expect(readFileSync(llm, 'utf8')).toBe(body);
  });
});
