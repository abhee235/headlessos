// M16.2: the install secret lives in the OS keychain, not in a plain file beside the logins.
// M16.3: macOS gets a word of warning before the Keychain asks.
// @see docs/phases/phase-16.md, docs/DECISIONS.md (ADR-029)
//
// Only this one value moves. Every saved login stays encrypted with it, exactly as before, so a
// plain enc-key put back undoes all of this. Nothing here imports electron, so it can be tested.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PLAIN_FILE = 'enc-key';
const KEYCHAIN_FILE = 'enc-key.keychain';
const NOTICE_FILE = 'keychain-notice';
const MIN_SECRET_LENGTH = 32;

/**
 * With no secret store on Linux, safeStorage falls back to a hardcoded password. That would only
 * look like protection, so it counts as no keychain at all.
 */
function keychainUsable(safeStorage, platform) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return !(platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text');
}

function readPlain(dir) {
  try {
    const secret = fs.readFileSync(path.join(dir, PLAIN_FILE), 'utf8').trim();
    return secret.length >= MIN_SECRET_LENGTH ? secret : null;
  } catch {
    return null;
  }
}

/** Stores the secret, and proves it opens again before anything relies on that */
function store(dir, secret, safeStorage, note) {
  const target = path.join(dir, KEYCHAIN_FILE);
  const tmp = `${target}.tmp`;
  try {
    fs.writeFileSync(tmp, safeStorage.encryptString(secret), { mode: 0o600 });
    if (safeStorage.decryptString(fs.readFileSync(tmp)) !== secret) throw new Error('read-back differs');
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    note(`could not store the secret in the keychain: ${err.message}`);
    return false;
  }
}

/**
 * Returns { secret, store }. store is 'keychain', 'file' or 'locked'.
 * A null secret with 'file' means the backend makes or reads the plain file, as it always has.
 */
function openInstallSecret({ dir, safeStorage, platform = process.platform, note = () => {} }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const usable = keychainUsable(safeStorage, platform);

  // A plain file always wins, so a restored backup works
  const plain = readPlain(dir);
  if (plain) {
    if (usable && store(dir, plain, safeStorage, note)) {
      fs.rmSync(path.join(dir, PLAIN_FILE), { force: true });
      return { secret: plain, store: 'keychain' };
    }
    return { secret: plain, store: 'file' };
  }

  const stored = path.join(dir, KEYCHAIN_FILE);
  if (fs.existsSync(stored)) {
    if (!usable) {
      note('the keychain is not available, so saved logins are locked');
      return { secret: null, store: 'locked' };
    }
    try {
      const secret = safeStorage.decryptString(fs.readFileSync(stored));
      if (secret.length >= MIN_SECRET_LENGTH) return { secret, store: 'keychain' };
      note('the keychain gave back something that is not the secret');
    } catch (err) {
      note(`could not open the keychain: ${err.message}`);
    }
    return { secret: null, store: 'locked' };
  }

  if (usable) {
    const secret = crypto.randomBytes(32).toString('hex');
    if (store(dir, secret, safeStorage, note)) return { secret, store: 'keychain' };
  }
  return { secret: null, store: 'file' };
}

/** M16.3: the Keychain can ask after each new version of an unsigned build, so warn once per version */
function shouldExplainKeychain({ dir, platform = process.platform, version }) {
  if (platform !== 'darwin') return false;
  try {
    return fs.readFileSync(path.join(dir, NOTICE_FILE), 'utf8').trim() !== version;
  } catch {
    return true;
  }
}

function markKeychainExplained({ dir, version }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, NOTICE_FILE), version, { mode: 0o600 });
}

/** The wording of the M16.3 dialog */
function keychainNotice(appName) {
  return {
    type: 'info',
    title: appName,
    message: 'macOS may ask for your password',
    detail:
      `${appName} keeps the key to your saved logins in the macOS Keychain, so other apps can't read it.\n\n` +
      `If macOS asks, enter your password and click Always Allow. Because ${appName} isn't signed yet, ` +
      'this can happen once after each update.\n\n' +
      `If any other app ever asks for "${appName} Safe Storage", click Deny.`,
    buttons: ['Continue'],
  };
}

module.exports = {
  KEYCHAIN_FILE,
  PLAIN_FILE,
  keychainNotice,
  keychainUsable,
  markKeychainExplained,
  openInstallSecret,
  shouldExplainKeychain,
};
