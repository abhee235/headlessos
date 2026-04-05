// M2.3: Security validators for command/path/ID validation
// @see docs/SECURITY.md

import { posix } from 'path';

/**
 * Validate a remote file path. Must be absolute and contain no traversal.
 */
export function validatePath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false;

  // Normalize and check for traversal
  const normalized = posix.normalize(path);
  if (normalized.includes('..')) return false;

  // Check for null bytes
  if (path.includes('\0')) return false;

  return true;
}

/**
 * Validate a Docker container ID (hex characters only).
 */
export function validateContainerId(id: string): boolean {
  return /^[a-f0-9]+$/.test(id);
}

/**
 * Validate a PID (integer only).
 */
export function validatePid(pid: string): boolean {
  return /^\d+$/.test(pid);
}

/**
 * Validate a service name (alphanumeric + hyphen + underscore + dot).
 */
export function validateServiceName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name);
}

/**
 * Escape a string for safe use in shell commands.
 */
export function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}
