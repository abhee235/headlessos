// Unit tests for client API functions
// Tests file CRUD operations: createDirectory, writeFile, deleteFile, renameFile

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDirectory,
  writeFile,
  deleteFile,
  renameFile,
  fetchFiles,
  readFile,
  backendUnreachableMessage,
} from '../../src/lib/api';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('createDirectory', () => {
  it('sends POST request with correct path', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await createDirectory('server-1', '/home/user/new-folder');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/servers/server-1/files/mkdir');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ path: '/home/user/new-folder' });
    expect(result).toEqual({ success: true });
  });

  it('throws on server error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'Permission denied' }, false, 403),
    );

    await expect(createDirectory('server-1', '/root/secret')).rejects.toThrow(
      'Permission denied',
    );
  });
});

describe('writeFile', () => {
  it('sends POST request with path and content', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await writeFile('server-1', '/home/user/test.txt', 'hello world');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/servers/server-1/files/write');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      path: '/home/user/test.txt',
      content: 'hello world',
    });
    expect(result).toEqual({ success: true });
  });

  it('creates empty file with empty content string', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

    await writeFile('server-1', '/home/user/empty.txt', '');

    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      path: '/home/user/empty.txt',
      content: '',
    });
  });

  it('throws on server error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'Disk full' }, false, 500),
    );

    await expect(
      writeFile('server-1', '/tmp/file', 'data'),
    ).rejects.toThrow('Disk full');
  });
});

describe('deleteFile', () => {
  it('sends DELETE request with path query param', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(undefined));

    await deleteFile('server-1', '/home/user/old-file.txt');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(
      '/api/servers/server-1/files?path=%2Fhome%2Fuser%2Fold-file.txt',
    );
    expect(opts.method).toBe('DELETE');
  });
});

describe('renameFile', () => {
  it('sends POST request with oldPath and newPath', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await renameFile(
      'server-1',
      '/home/user/old-name',
      '/home/user/new-name',
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/servers/server-1/files/rename');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      oldPath: '/home/user/old-name',
      newPath: '/home/user/new-name',
    });
    expect(result).toEqual({ success: true });
  });
});

describe('fetchFiles', () => {
  it('sends GET request with path query param', async () => {
    const files = [
      { name: 'test.txt', type: 'file', permissions: '-rw-r--r--', owner: 'user', group: 'user', size: 100, modified: '2024-01-01' },
    ];
    mockFetch.mockResolvedValueOnce(mockResponse(files));

    const result = await fetchFiles('server-1', '/home/user');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/servers/server-1/files?path=%2Fhome%2Fuser');
    expect(result).toEqual(files);
  });
});

describe('readFile', () => {
  it('sends GET request and returns content with encoding', async () => {
    const data = { content: 'file contents', encoding: 'utf-8' };
    mockFetch.mockResolvedValueOnce(mockResponse(data));

    const result = await readFile('server-1', '/home/user/readme.md');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      '/api/servers/server-1/files/read?path=%2Fhome%2Fuser%2Freadme.md',
    );
    expect(result).toEqual(data);
  });
});

// M15.1: fetch rejects when no response came back, which the browser words as "Failed to fetch"
describe('when the backend cannot be reached', () => {
  it('explains the failure instead of showing the browser error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const failure = createDirectory('server-1', '/root/x');
    await expect(failure).rejects.toThrow(backendUnreachableMessage());
    await expect(failure).rejects.not.toThrow('Failed to fetch');
  });

  it('keeps the browser error as the cause', async () => {
    const cause = new TypeError('Failed to fetch');
    mockFetch.mockRejectedValue(cause);
    await expect(createDirectory('server-1', '/root/x')).rejects.toMatchObject({ cause });
  });

  it('leaves an aborted request alone', async () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValue(abort);
    await expect(createDirectory('server-1', '/root/x')).rejects.toBe(abort);
  });

  it('leaves an HTTP error from the backend alone', async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: 'Disk full' }, false, 500));
    await expect(createDirectory('server-1', '/root/x')).rejects.toThrow('Disk full');
  });

  it('points the desktop app at the log, and a browser at npm run dev', () => {
    expect(backendUnreachableMessage(true)).toContain('open the log from Global Settings');
    expect(backendUnreachableMessage(false)).toContain('npm run dev');
    for (const desktop of [true, false]) {
      expect(backendUnreachableMessage(desktop)).toContain('nothing was sent to your server');
    }
  });
});
