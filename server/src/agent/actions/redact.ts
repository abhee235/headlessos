// EX9.5: Secret redaction — keep credentials out of the model's context
// @see docs/phases/phase-ex9.md §10
//
// Applied to every action's output before anyone downstream sees it (the model,
// the owner's step view, view-button results). Rules are deliberately narrow:
// key/value secrets need "=" or ":" after the key, so prose and config keywords
// such as "PasswordAuthentication no" are left alone.

interface Rule {
  re: RegExp;
  replace: string | ((...m: string[]) => string);
}

const SECRET_KEY = '[A-Za-z0-9_.-]*(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*';

const RULES: Rule[] = [
  // PEM private keys (RSA, EC, OPENSSH, PKCS#8 …)
  { re: /-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----[\s\S]*?(?:-----END \1PRIVATE KEY-----|$)/g, replace: '[private key removed]' },
  // Connection strings with a password: scheme://user:password@host
  { re: /\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+):([^@\s/]+)@/gi, replace: (_m, prefix) => `${prefix}:[redacted]@` },
  // Authorization headers / bearer tokens
  { re: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{16,}=*/g, replace: (_m, kind) => `${kind} [redacted]` },
  // JSON Web Tokens
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: '[token removed]' },
  // Well-known API key shapes
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: '[aws key removed]' },
  { re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g, replace: '[api key removed]' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g, replace: '[github token removed]' },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/g, replace: '[gitlab token removed]' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: '[slack token removed]' },
  // crypt(3) password hashes
  { re: /\$(?:1|5|6|y|2[aby])\$[./A-Za-z0-9$]{20,}/g, replace: '[hash removed]' },
  // key = value / key: value / "key": "value" (env files, YAML, JSON, INI)
  {
    // a placeholder left by an earlier rule ("[api key removed]") is one value, already clean
    re: new RegExp(`(["']?\\b${SECRET_KEY}["']?)(\\s*[=:]\\s*)("[^"\\n]*"|'[^'\\n]*'|\\[(?:redacted|[a-z ]+ removed)\\]|[^\\s,;}\\]]+)`, 'gi'),
    replace: (m, key, sep, value) =>
      // PWD / OLDPWD are directories; flags and numbers are not secrets
      /^["']?(old)?pwd["']?$/i.test(key) || /^["']?(\[(redacted|[a-z ]+ removed)\]|true|false|null|yes|no|on|off|\d+)["']?$/i.test(value)
        ? m
        : `${key}${sep}[redacted]`,
  },
];

/** Remove secrets from text; returns the cleaned text and how many values were removed. */
export function redactSecrets(text: string): { text: string; count: number } {
  if (!text) return { text, count: 0 };
  let count = 0;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, (...m: string[]) => {
      const replaced = typeof rule.replace === 'string' ? rule.replace : rule.replace(...m);
      if (replaced !== m[0]) count++;
      return replaced;
    });
  }
  return { text: out, count };
}
