// M3.1: Docker Routes Tests — unit tests for docker route parsing and validation
// @see docs/phases/phase-3.md

import { describe, it, expect } from 'vitest';

// Test the isValidDockerRef validation logic (from docker routes)
function isValidDockerRef(ref: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.\-/:]*$/.test(ref) && ref.length <= 256;
}

// Test the parseContainers function
interface DockerPsJson {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  Ports: string;
  CreatedAt: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  ports: string;
  created: string;
}

function parseContainers(stdout: string): DockerContainer[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const containers: DockerContainer[] = [];
  for (const line of lines) {
    try {
      const raw: DockerPsJson = JSON.parse(line);
      const state = raw.State.toLowerCase();
      containers.push({
        id: raw.ID,
        name: raw.Names,
        image: raw.Image,
        status: raw.Status,
        state: (['running', 'exited', 'paused', 'restarting', 'dead'].includes(state)
          ? state
          : 'exited') as DockerContainer['state'],
        ports: raw.Ports,
        created: raw.CreatedAt,
      });
    } catch {
      // skip malformed lines
    }
  }
  return containers;
}

interface DockerImageJson {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedAt: string;
}

interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

function parseImages(stdout: string): DockerImage[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const images: DockerImage[] = [];
  for (const line of lines) {
    try {
      const raw: DockerImageJson = JSON.parse(line);
      images.push({
        id: raw.ID,
        repository: raw.Repository,
        tag: raw.Tag,
        size: raw.Size,
        created: raw.CreatedAt,
      });
    } catch {
      // skip malformed lines
    }
  }
  return images;
}

describe('isValidDockerRef', () => {
  it('accepts valid container IDs (hex)', () => {
    expect(isValidDockerRef('abc123def456')).toBe(true);
    expect(isValidDockerRef('a1b2c3d4e5f6')).toBe(true);
  });

  it('accepts valid container names', () => {
    expect(isValidDockerRef('my-container')).toBe(true);
    expect(isValidDockerRef('my_container')).toBe(true);
    expect(isValidDockerRef('myapp.web')).toBe(true);
  });

  it('accepts image references with tags', () => {
    expect(isValidDockerRef('nginx:latest')).toBe(true);
    expect(isValidDockerRef('registry.example.com/myapp:v1.2.3')).toBe(true);
    expect(isValidDockerRef('ubuntu:22.04')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidDockerRef('')).toBe(false);
  });

  it('rejects strings starting with special chars', () => {
    expect(isValidDockerRef('-mycontainer')).toBe(false);
    expect(isValidDockerRef('.hidden')).toBe(false);
  });

  it('rejects shell injection attempts', () => {
    expect(isValidDockerRef('abc; rm -rf /')).toBe(false);
    expect(isValidDockerRef('$(whoami)')).toBe(false);
    expect(isValidDockerRef('`id`')).toBe(false);
    expect(isValidDockerRef('abc && cat /etc/passwd')).toBe(false);
    expect(isValidDockerRef('abc|cat')).toBe(false);
  });

  it('rejects strings longer than 256 chars', () => {
    expect(isValidDockerRef('a'.repeat(257))).toBe(false);
    expect(isValidDockerRef('a'.repeat(256))).toBe(true);
  });
});

describe('parseContainers', () => {
  it('parses docker ps JSON output correctly', () => {
    const stdout = [
      '{"ID":"abc123","Names":"web-app","Image":"nginx:latest","Status":"Up 2 hours","State":"running","Ports":"0.0.0.0:80->80/tcp","CreatedAt":"2024-01-15 10:00:00 +0000 UTC"}',
      '{"ID":"def456","Names":"db","Image":"postgres:16","Status":"Exited (0) 3 hours ago","State":"exited","Ports":"","CreatedAt":"2024-01-14 08:00:00 +0000 UTC"}',
    ].join('\n');

    const result = parseContainers(stdout);
    expect(result).toHaveLength(2);

    expect(result[0].id).toBe('abc123');
    expect(result[0].name).toBe('web-app');
    expect(result[0].image).toBe('nginx:latest');
    expect(result[0].state).toBe('running');
    expect(result[0].ports).toBe('0.0.0.0:80->80/tcp');

    expect(result[1].id).toBe('def456');
    expect(result[1].name).toBe('db');
    expect(result[1].state).toBe('exited');
  });

  it('handles empty output', () => {
    expect(parseContainers('')).toHaveLength(0);
    expect(parseContainers('\n')).toHaveLength(0);
  });

  it('skips malformed JSON lines', () => {
    const stdout = [
      '{"ID":"abc123","Names":"ok","Image":"nginx","Status":"Up","State":"running","Ports":"","CreatedAt":"2024-01-15"}',
      'this is not json',
      '{"ID":"def456","Names":"also-ok","Image":"redis","Status":"Up","State":"running","Ports":"","CreatedAt":"2024-01-15"}',
    ].join('\n');

    const result = parseContainers(stdout);
    expect(result).toHaveLength(2);
  });

  it('maps unknown states to exited', () => {
    const stdout = '{"ID":"x","Names":"x","Image":"x","Status":"x","State":"UNKNOWN_STATE","Ports":"","CreatedAt":"x"}';
    const result = parseContainers(stdout);
    expect(result[0].state).toBe('exited');
  });

  it('handles all valid states', () => {
    const states = ['running', 'exited', 'paused', 'restarting', 'dead'];
    for (const state of states) {
      const stdout = `{"ID":"x","Names":"x","Image":"x","Status":"x","State":"${state}","Ports":"","CreatedAt":"x"}`;
      const result = parseContainers(stdout);
      expect(result[0].state).toBe(state);
    }
  });
});

describe('parseImages', () => {
  it('parses docker images JSON output correctly', () => {
    const stdout = [
      '{"ID":"sha256:abc","Repository":"nginx","Tag":"latest","Size":"187MB","CreatedAt":"2024-01-10 12:00:00 +0000 UTC"}',
      '{"ID":"sha256:def","Repository":"postgres","Tag":"16","Size":"412MB","CreatedAt":"2024-01-08 09:00:00 +0000 UTC"}',
    ].join('\n');

    const result = parseImages(stdout);
    expect(result).toHaveLength(2);

    expect(result[0].id).toBe('sha256:abc');
    expect(result[0].repository).toBe('nginx');
    expect(result[0].tag).toBe('latest');
    expect(result[0].size).toBe('187MB');

    expect(result[1].repository).toBe('postgres');
    expect(result[1].tag).toBe('16');
  });

  it('handles empty output', () => {
    expect(parseImages('')).toHaveLength(0);
  });

  it('skips malformed lines', () => {
    const stdout = 'not json\n{"ID":"x","Repository":"ok","Tag":"1","Size":"1MB","CreatedAt":"x"}';
    const result = parseImages(stdout);
    expect(result).toHaveLength(1);
    expect(result[0].repository).toBe('ok');
  });
});
