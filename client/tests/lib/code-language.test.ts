// EX8.8: language detection for the Monaco code editor
import { describe, it, expect } from 'vitest';
import { languageForFile, languageLabel, fileLanguageLabel } from '../../src/lib/code-language';

describe('languageForFile', () => {
  it.each([
    ['/srv/app/server.ts', 'typescript'],
    ['index.jsx', 'javascript'],
    ['/etc/app/config.json', 'json'],
    ['docker-compose.yml', 'yaml'],
    ['/etc/nginx/nginx.conf', 'shell'],
    ['/etc/systemd/system/web.service', 'ini'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
    ['deploy.sh', 'shell'],
    ['query.sql', 'sql'],
    ['README.md', 'markdown'],
    ['main.tf', 'hcl'],
  ])('%s → %s', (path, lang) => {
    expect(languageForFile(path)).toBe(lang);
  });

  it('matches extension-less names, case-insensitively', () => {
    expect(languageForFile('/app/Dockerfile')).toBe('dockerfile');
    expect(languageForFile('Dockerfile.prod')).toBe('dockerfile');
    expect(languageForFile('/home/u/.bashrc')).toBe('shell');
    expect(languageForFile('Makefile')).toBe('shell');
    expect(languageForFile('/app/.env')).toBe('ini');
    expect(languageForFile('/app/.env.production')).toBe('ini');
    expect(languageForFile('/etc/ssh/sshd_config')).toBe('shell');
  });

  it('falls back to plaintext', () => {
    expect(languageForFile('/var/log/syslog')).toBe('plaintext');
    expect(languageForFile('archive.xyz')).toBe('plaintext');
    expect(languageForFile('')).toBe('plaintext');
  });
});

describe('labels', () => {
  it('names languages for the toolbar chip', () => {
    expect(languageLabel('typescript')).toBe('TypeScript');
    expect(languageLabel('plaintext')).toBe('Plain text');
    expect(fileLanguageLabel('/srv/app.py')).toBe('Python');
  });

  it('calls config files Config, not Shell', () => {
    expect(fileLanguageLabel('/etc/nginx/nginx.conf')).toBe('Config');
    expect(fileLanguageLabel('/etc/hosts')).toBe('Config');
    expect(fileLanguageLabel('deploy.sh')).toBe('Shell');
  });
});
