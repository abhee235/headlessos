// M17.2: gives a Mach-O executable UUIDs of its own (ADR-030)
// @see docs/phases/phase-17.md
//
// Electron's main executable and its helpers are the same files in every app built on one Electron
// version, so they share their LC_UUID. Apple's TN3179 warns that local network privacy "may behave
// weirdly" then, and TN3178 says no Apple tool changes a built image's UUID. This rewrites the 16 bytes
// of each slice's LC_UUID and nothing else. The file must be signed again afterwards, because a
// signature covers the UUID.

const { createHash } = require('node:crypto');

const LC_UUID = 0x1b;
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const MH_MAGIC = 0xfeedface;
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM = 0xcefaedfe;
const MH_CIGAM_64 = 0xcffaedfe;

/** A UUID as dwarfdump prints it. */
function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString('hex').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 16 bytes from `seed` and the slice's CPU type, marked as a name-based UUID (RFC 4122, version 5). */
function uuidFor(seed, cputype) {
  const bytes = createHash('sha256').update(`${seed}\0${cputype}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

/** Each slice of a file: where it starts and how long it is. A thin file is one slice. */
function slicesOf(buf) {
  if (buf.length < 8) throw new Error('not a Mach-O file');
  const magic = buf.readUInt32BE(0);
  if (magic === FAT_MAGIC || magic === FAT_MAGIC_64) {
    const wide = magic === FAT_MAGIC_64;
    const count = buf.readUInt32BE(4);
    // Java class files share 0xcafebabe; their next field is a version, far above any slice count.
    if (count === 0 || count > 32) throw new Error('not a Mach-O file');
    const slices = [];
    for (let i = 0; i < count; i++) {
      const at = 8 + i * (wide ? 32 : 20);
      const offset = wide ? Number(buf.readBigUInt64BE(at + 8)) : buf.readUInt32BE(at + 8);
      const size = wide ? Number(buf.readBigUInt64BE(at + 16)) : buf.readUInt32BE(at + 12);
      if (offset + size > buf.length) throw new Error(`slice ${i + 1} runs past the end of the file`);
      slices.push({ offset, size });
    }
    return slices;
  }
  return [{ offset: 0, size: buf.length }];
}

/**
 * Rewrites the LC_UUID of every slice in `buf`, in place. Returns each slice's CPU type with its UUID
 * before and after. Throws if `buf` isn't Mach-O or a slice has no LC_UUID, changing nothing.
 */
function rewriteUuids(buf, seed) {
  const planned = slicesOf(buf).map(({ offset, size }) => {
    const magic = buf.readUInt32LE(offset);
    let little;
    if (magic === MH_MAGIC || magic === MH_MAGIC_64) little = true;
    else if (magic === MH_CIGAM || magic === MH_CIGAM_64) little = false;
    else throw new Error('not a Mach-O file');
    const wide = magic === MH_MAGIC_64 || magic === MH_CIGAM_64;
    const u32 = (at) => (little ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
    const cputype = u32(offset + 4);
    const ncmds = u32(offset + 16);
    let at = offset + (wide ? 32 : 28);
    for (let n = 0; n < ncmds; n++) {
      if (at + 8 > offset + size) break;
      const cmd = u32(at);
      const cmdsize = u32(at + 4);
      if (cmd === LC_UUID) {
        if (cmdsize < 24) throw new Error('LC_UUID is too short');
        return { at: at + 8, cputype };
      }
      if (cmdsize < 8) throw new Error('a load command is too short');
      at += cmdsize;
    }
    throw new Error(`the slice for CPU type ${cputype} has no LC_UUID`);
  });
  return planned.map(({ at, cputype }) => {
    const before = formatUuid(buf.subarray(at, at + 16));
    uuidFor(seed, cputype).copy(buf, at);
    return { cputype, before, after: formatUuid(buf.subarray(at, at + 16)) };
  });
}

module.exports = { rewriteUuids, uuidFor, formatUuid, LC_UUID };
