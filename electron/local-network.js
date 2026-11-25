// M17.7: on a Mac, the app says the Local Network prompt is coming, once per version.
// M17.8: a blocked connection opens the setting.
// @see docs/phases/phase-17.md
//
// macOS asks before an app reaches a device on the local network, and an unsigned build can be asked
// about again after each update, like the Keychain (M16.3). The renderer asks for these by name only:
// the address opened is fixed here.

const fs = require('node:fs');
const path = require('node:path');

const NOTICE_FILE = 'local-network-notice';

/**
 * System Settings at Privacy & Security → Local Network. Apple doesn't document this address; if macOS
 * doesn't know the Local Network part it opens Privacy & Security, which the button is named for.
 */
const LOCAL_NETWORK_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork';

function shouldExplainLocalNetwork({ dir, platform = process.platform, version }) {
  if (platform !== 'darwin') return false;
  try {
    return fs.readFileSync(path.join(dir, NOTICE_FILE), 'utf8').trim() !== version;
  } catch {
    return true;
  }
}

function markLocalNetworkExplained({ dir, version }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, NOTICE_FILE), version, { mode: 0o600 });
}

/** The wording of the M17.7 dialog */
function localNetworkNotice(appName) {
  return {
    type: 'info',
    title: appName,
    message: 'macOS will ask about your local network',
    detail:
      `To reach a device on your local network, macOS asks whether ${appName} may find devices on it. ` +
      'Click Allow.\n\n' +
      "If this first try doesn't connect while macOS asks, connect again after you click Allow.\n\n" +
      `Because ${appName} isn't signed by Apple yet, macOS can ask again after an update.`,
    buttons: ['Continue'],
  };
}

module.exports = {
  NOTICE_FILE,
  LOCAL_NETWORK_SETTINGS,
  shouldExplainLocalNetwork,
  markLocalNetworkExplained,
  localNetworkNotice,
};
