// @ts-check
/**
 * Fork-specific distribution settings (ArduinoTechnoEduc2).
 * Used by preferences defaults and packaging metadata.
 */
const FORK_GITHUB_OWNER = 'technologiescollege';
const FORK_GITHUB_REPO = 'ArduinoTechnoEduc2';

/** Generic electron-updater feed (assets of the GitHub "latest" release). */
const FORK_UPDATE_BASE_URL = `https://github.com/${FORK_GITHUB_OWNER}/${FORK_GITHUB_REPO}/releases/latest/download`;

const FORK_APP_ID = 'fr.technologiescollege.ArduinoTechnoEduc2';
const FORK_PRODUCT_NAME = 'Arduino TechnoEduc';
const FORK_CONFIG_DIR = '.ArduinoTechnoEduc2';
const FORK_URI_SCHEME = 'arduino-technoeduc';

module.exports = {
  FORK_GITHUB_OWNER,
  FORK_GITHUB_REPO,
  FORK_UPDATE_BASE_URL,
  FORK_APP_ID,
  FORK_PRODUCT_NAME,
  FORK_CONFIG_DIR,
  FORK_URI_SCHEME,
};
