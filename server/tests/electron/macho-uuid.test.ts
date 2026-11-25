// M17.2: the Mac app's executables get UUIDs of their own, and nothing else in them changes
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { rewriteUuids, formatUuid, LC_UUID } = require('../../../electron/scripts/macho-uuid.js') as {
  rewriteUuids: (buf: Buffer, seed: string) => { cputype: number; before: string; after: string }[];
  formatUuid: (bytes: Buffer) => string;
  LC_UUID: number;
};

const ARM64 = 0x0100000c;
const X86_64 = 0x01000007;
const LC_SEGMENT_64 = 0x19;

/** A small 64-bit Mach-O: a segment command, then LC_UUID (unless `withUuid` is false), then padding. */
function thin(cputype: number, uuid: number, { little = true, withUuid = true } = {}): Buffer {
  const commands = withUuid ? 2 : 1;
  const buf = Buffer.alloc(32 + 72 + (withUuid ? 24 : 0) + 64, 0xab);
  const u32 = (at: number, v: number) => (little ? buf.writeUInt32LE(v >>> 0, at) : buf.writeUInt32BE(v >>> 0, at));
  u32(0, 0xfeedfacf);
  u32(4, cputype);
  u32(8, 0);
  u32(12, 2); // MH_EXECUTE
  u32(16, commands);
  u32(20, 72 + (withUuid ? 24 : 0));
  u32(24, 0);
  u32(28, 0);
  u32(32, LC_SEGMENT_64);
  u32(36, 72);
  if (withUuid) {
    u32(104, LC_UUID);
    u32(108, 24);
    buf.fill(uuid, 112, 128);
  }
  return buf;
}

/** A universal file holding `slices`, each at a 4096-byte boundary. */
function fat(slices: { cputype: number; body: Buffer }[], wide = false): Buffer {
  const header = 8 + slices.length * (wide ? 32 : 20);
  let at = 4096;
  const placed = slices.map((s) => {
    const offset = at;
    at += Math.ceil(s.body.length / 4096) * 4096;
    return { ...s, offset };
  });
  const buf = Buffer.alloc(at, 0);
  buf.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe, 0);
  buf.writeUInt32BE(slices.length, 4);
  placed.forEach((s, i) => {
    const e = 8 + i * (wide ? 32 : 20);
    buf.writeUInt32BE(s.cputype, e);
    buf.writeUInt32BE(0, e + 4);
    if (wide) {
      buf.writeBigUInt64BE(BigInt(s.offset), e + 8);
      buf.writeBigUInt64BE(BigInt(s.body.length), e + 16);
      buf.writeUInt32BE(12, e + 24);
    } else {
      buf.writeUInt32BE(s.offset, e + 8);
      buf.writeUInt32BE(s.body.length, e + 12);
      buf.writeUInt32BE(12, e + 16);
    }
    s.body.copy(buf, s.offset);
  });
  expect(header).toBeLessThan(4096);
  return buf;
}

/** The byte positions where `a` and `b` differ. */
function differences(a: Buffer, b: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

const SEED = 'com.headlessos.app\u00000.3.3\u0000Contents/MacOS/HeadlessOS';

describe('rewriteUuids', () => {
  it('changes only the 16 bytes of a thin file\'s LC_UUID', () => {
    const before = thin(ARM64, 0x11);
    const buf = Buffer.from(before);
    const [slice] = rewriteUuids(buf, SEED);
    expect(slice.cputype).toBe(ARM64);
    expect(slice.before).toBe(formatUuid(Buffer.alloc(16, 0x11)));
    expect(slice.after).not.toBe(slice.before);
    const changed = differences(before, buf);
    expect(changed.length).toBeGreaterThan(0);
    expect(Math.min(...changed)).toBeGreaterThanOrEqual(112);
    expect(Math.max(...changed)).toBeLessThan(128);
  });

  it('marks the new UUID as name-based (version 5) with the RFC 4122 variant', () => {
    const buf = thin(ARM64, 0x00);
    rewriteUuids(buf, SEED);
    expect(buf[112 + 6] >> 4).toBe(5);
    expect(buf[112 + 8] >> 6).toBe(0b10);
  });

  it('gives the same UUID for the same seed, and another for another seed', () => {
    const a = thin(ARM64, 0x22);
    const b = thin(ARM64, 0x22);
    const c = thin(ARM64, 0x22);
    expect(rewriteUuids(a, SEED)[0].after).toBe(rewriteUuids(b, SEED)[0].after);
    expect(rewriteUuids(c, `${SEED}x`)[0].after).not.toBe(rewriteUuids(Buffer.from(thin(ARM64, 0x22)), SEED)[0].after);
  });

  it('rewrites every slice of a universal file, each with its own UUID', () => {
    const before = fat([
      { cputype: X86_64, body: thin(X86_64, 0x33) },
      { cputype: ARM64, body: thin(ARM64, 0x33) },
    ]);
    const buf = Buffer.from(before);
    const slices = rewriteUuids(buf, SEED);
    expect(slices.map((s) => s.cputype)).toEqual([X86_64, ARM64]);
    expect(slices[0].after).not.toBe(slices[1].after);
    // Only each slice's UUID bytes changed: slice offsets are 4096 and 8192.
    for (const i of differences(before, buf)) {
      const inSlice = i >= 8192 ? i - 8192 : i - 4096;
      expect(inSlice).toBeGreaterThanOrEqual(112);
      expect(inSlice).toBeLessThan(128);
    }
  });

  it('reads a 64-bit universal header', () => {
    const buf = fat([{ cputype: ARM64, body: thin(ARM64, 0x44) }, { cputype: X86_64, body: thin(X86_64, 0x44) }], true);
    expect(rewriteUuids(buf, SEED).map((s) => s.cputype)).toEqual([ARM64, X86_64]);
  });

  it('reads a big-endian slice', () => {
    const buf = thin(ARM64, 0x55, { little: false });
    const [slice] = rewriteUuids(buf, SEED);
    expect(slice.cputype).toBe(ARM64);
    expect(slice.before).toBe(formatUuid(Buffer.alloc(16, 0x55)));
  });

  it('changes nothing when one slice has no LC_UUID', () => {
    const before = fat([
      { cputype: X86_64, body: thin(X86_64, 0x66) },
      { cputype: ARM64, body: thin(ARM64, 0x66, { withUuid: false }) },
    ]);
    const buf = Buffer.from(before);
    expect(() => rewriteUuids(buf, SEED)).toThrow(/no LC_UUID/);
    expect(buf.equals(before)).toBe(true);
  });

  it('refuses a file that is not Mach-O, including a Java class file', () => {
    expect(() => rewriteUuids(Buffer.from('PK\u0003\u0004 not an executable'), SEED)).toThrow(/not a Mach-O/);
    const javaClass = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34, 0, 0, 0, 0]);
    expect(() => rewriteUuids(javaClass, SEED)).toThrow(/not a Mach-O/);
  });

  it('refuses a universal file whose slice runs past its end', () => {
    const buf = fat([{ cputype: ARM64, body: thin(ARM64, 0x77) }]);
    expect(() => rewriteUuids(buf.subarray(0, 4100), SEED)).toThrow(/past the end/);
  });
});
