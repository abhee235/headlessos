// EX5-A.2: Command Template Utility — compose CLI commands from form values
// @see docs/phases/phase-ex5.md — EX5-A.2

/**
 * Shell-escape a value for safe inclusion in a CLI command.
 * Wraps in single quotes, escaping existing single quotes.
 */
export function shellEscape(value: string): string {
  if (value === '') return "''";
  // If value contains no special chars, return as-is for readability
  if (/^[a-zA-Z0-9._/~:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Compose a CLI command from a template and form values.
 * 
 * Template syntax:
 *   - `{fieldKey}` — substituted with the shell-escaped value
 *   - Boolean fields: if true, the placeholder is replaced with the key as a flag (e.g., `{--verbose}` → `--verbose`)
 *   - Boolean fields: if false, the placeholder is removed entirely
 *   - Empty string values are omitted (placeholder removed)
 * 
 * Examples:
 *   - Template: `nginx -c {configPath} -p {prefix}`
 *     Values: { configPath: '/etc/nginx/nginx.conf', prefix: '/usr/share/nginx' }
 *     Result: `nginx -c /etc/nginx/nginx.conf -p /usr/share/nginx`
 * 
 *   - Template: `restic backup {--verbose} {--exclude} {path}`
 *     Values: { '--verbose': true, '--exclude': '*.log', path: '/data' }
 *     Result: `restic backup --verbose --exclude '*.log' /data`
 */
export function composeCommand(
  template: string,
  values: Record<string, string | number | boolean>,
): string {
  let result = template;

  // Replace each {key} placeholder with the corresponding value
  result = result.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = values[key];

    // Key not found in values — remove placeholder
    if (value === undefined || value === null) return '';

    // Boolean: true → include the key as a flag, false → omit
    if (typeof value === 'boolean') {
      return value ? key : '';
    }

    // Number → convert to string
    if (typeof value === 'number') {
      return String(value);
    }

    // String: empty → omit, otherwise shell-escape
    if (value === '') return '';
    return shellEscape(value);
  });

  // Clean up extra whitespace from removed placeholders
  return result.replace(/\s{2,}/g, ' ').trim();
}
