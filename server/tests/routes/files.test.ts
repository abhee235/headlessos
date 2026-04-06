// M6.7: File Copy/Move route tests — shell escaping, validation
import { describe, it, expect } from 'vitest';

// Test the shellEscapeForCopy function (extracted from files.ts)
function shellEscapeForCopy(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

describe('files copy/move helpers', () => {
  describe('shellEscapeForCopy', () => {
    it('wraps simple path in single quotes', () => {
      expect(shellEscapeForCopy('/home/user/file.txt')).toBe("'/home/user/file.txt'");
    });

    it('escapes single quotes in path', () => {
      expect(shellEscapeForCopy("/home/user/it's a file.txt")).toBe("'/home/user/it'\\''s a file.txt'");
    });

    it('handles paths with spaces', () => {
      expect(shellEscapeForCopy('/home/user/my file.txt')).toBe("'/home/user/my file.txt'");
    });

    it('handles root path', () => {
      expect(shellEscapeForCopy('/')).toBe("'/'");
    });

    it('handles nested path with special chars', () => {
      expect(shellEscapeForCopy('/home/user/dir with (parens)/file [1].txt'))
        .toBe("'/home/user/dir with (parens)/file [1].txt'");
    });

    it('handles path with dollar sign', () => {
      expect(shellEscapeForCopy('/home/user/$HOME')).toBe("'/home/user/$HOME'");
    });

    it('handles path with backticks', () => {
      expect(shellEscapeForCopy('/home/user/`cmd`')).toBe("'/home/user/`cmd`'");
    });

    it('handles multiple single quotes', () => {
      expect(shellEscapeForCopy("/home/it's/user's")).toBe("'/home/it'\\''s/user'\\''s'");
    });
  });

  describe('copy command construction', () => {
    it('builds valid cp -r command', () => {
      const source = '/home/user/source';
      const dest = '/home/user/dest';
      const command = `cp -r ${shellEscapeForCopy(source)} ${shellEscapeForCopy(dest)}`;
      expect(command).toBe("cp -r '/home/user/source' '/home/user/dest'");
    });

    it('handles paths with spaces in command', () => {
      const source = '/home/my user/my file.txt';
      const dest = '/tmp/backup dir/copy.txt';
      const command = `cp -r ${shellEscapeForCopy(source)} ${shellEscapeForCopy(dest)}`;
      expect(command).toBe("cp -r '/home/my user/my file.txt' '/tmp/backup dir/copy.txt'");
    });
  });
});
