import { ElectronVersion, ElectronVersionSource, ElectronVersionState, NpmVersion } from '../interfaces';
import { normalizeVersion } from '../utils/normalize-version';

export const enum ElectronReleaseChannel {
  stable = 'Stable',
  beta = 'Beta',
  nightly = 'Nightly',
  unsupported = 'Unsupported'
}

/**
 * Returns a sensible default version string.
 *
 * @param {Array<ElectronVersion>} knownVersions
 * @returns {string}
 */
export function getDefaultVersion(
  knownVersions: Array<ElectronVersion> = []
): string {
  const ls = localStorage.getItem('version');

  if (ls && knownVersions.find(({ version }) => version === ls)) {
    return ls;
  }

  // Self-heal: Version not formated correctly
  const normalized = ls && normalizeVersion(ls);
  if (normalized) {
    if (knownVersions.find(({ version }) => version === normalized)) {
      return normalized;
    }
  }

  // Self-heal: Unknown version
  if (ls && knownVersions[0]) {
    return knownVersions[0].version;
  }

  // Alright, the first version?
  if (knownVersions && knownVersions[0] && knownVersions[0].version) {
    return knownVersions[0].version;
  }

  // Report error
  throw new Error('Corrupted version data');
}

/**
 * Return the release channel for a given input
 * version.
 *
 * @param {NpmVersion} input
 * @returns {ElectronReleaseChannel}
 */
export function getReleaseChannel(
  input: NpmVersion
): ElectronReleaseChannel {
  const tag = input.version || '';

  if (tag.includes('beta')) {
    return ElectronReleaseChannel.beta;
  }

  if (tag.includes('nightly')) {
    return ElectronReleaseChannel.nightly;
  }

  if (tag.includes('unsupported')) {
    return ElectronReleaseChannel.unsupported;
  }

  // Must be a stable version, right?
  return ElectronReleaseChannel.stable;
}

export const enum VersionKeys {
  local = 'local-electron-versions',
  known = 'known-electron-versions'
}

/**
 * Retrieve Electron versions from localStorage.
 *
 * @param {VersionKeys} key
 * @param {() => Array<NpmVersion>} fallbackMethod
 * @returns {Array<NpmVersion>}
 */
function getVersions(
  key: VersionKeys, fallbackMethod: () => Array<NpmVersion>
): Array<NpmVersion> {
  const fromLs = window.localStorage.getItem(key);

  if (fromLs) {
    try {
      let result: Array<NpmVersion> = JSON.parse(fromLs);

      if (!isExpectedFormat(result)) {
        // Known versions can just be downloaded again.
        if (key === VersionKeys.known) {
          throw new Error(`Electron versions in LS does not match expected format`);
        }

        // Local versions are a bit more tricky and might be in an old format (pre 0.5)
        result = migrateVersions(result);
        saveLocalVersions(result);
      }

      return result;
    } catch (error) {
      console.warn(`Parsing local Electron versions failed, returning fallback method.`);
    }
  }

  return fallbackMethod();
}

/**
 * Save an array of GitHubVersions to localStorage.
 *
 * @param {VersionKeys} key
 * @param {Array<NpmVersion} versions
 */
function saveVersions(key: VersionKeys, versions: Array<NpmVersion>) {
  const stringified = JSON.stringify(versions);
  window.localStorage.setItem(key, stringified);
}

/**
 * Return both known as well as local versions.
 *
 * @returns {Array<NpmVersion>}
 */
export function getElectronVersions(): Array<ElectronVersion> {
  const known: Array<ElectronVersion> = getKnownVersions().map((version) => {
    return {
      ...version,
      source: ElectronVersionSource.remote,
      state: ElectronVersionState.unknown
    };
  });

  const local: Array<ElectronVersion> = getLocalVersions().map((version) => {
    return {
      ...version,
      source: ElectronVersionSource.local,
      state: ElectronVersionState.ready
    };
  });

  return [ ...known, ...local ];
}

/**
 * Add a version to the local versions
 *
 * @param {NpmVersion} input
 * @returns {Array<NpmVersion>}
 */
export function addLocalVersion(input: NpmVersion): Array<NpmVersion> {
  const versions = getLocalVersions();

  if (!versions.find((v) => v.localPath === input.localPath)) {
    versions.push(input);
  }

  saveLocalVersions(versions);

  return versions;
}

/**
 * Retrieves local Electron versions, configured by the user.
 *
 * @returns {Array<NpmVersion>}
 */
export function getLocalVersions(): Array<NpmVersion> {
  const versions = getVersions(VersionKeys.local, () => []);

  return versions;
}

/**
 * Saves local versions to localStorage.
 *
 * @param {Array<NpmVersion>} versions
 */
export function saveLocalVersions(versions: Array<NpmVersion | ElectronVersion>) {
  const filteredVersions = versions.filter((v) => {
    if (isElectronVersion(v)) {
      return v.source === ElectronVersionSource.local;
    }

    return true;
  });

  return saveVersions(VersionKeys.local, filteredVersions);
}

/**
 * Retrieves our best guess regarding the latest Electron versions. Tries to
 * fetch them from localStorage, then from a static releases.json file.
 *
 * @returns {Array<NpmVersion>}
 */
export function getKnownVersions(): Array<NpmVersion> {
  return getVersions(VersionKeys.known, () => require('../../static/releases.json'));
}

/**
 * Saves known versions to localStorage.
 *
 * @param {Array<NpmVersion>} versions
 */
export function saveKnownVersions(versions: Array<NpmVersion>) {
  return saveVersions(VersionKeys.known, versions);
}

/**
 * Tries to refresh our known versions and returns whatever we have
 * saved after.
 *
 * @export
 * @returns {Promise<Array<ElectronVersion>>}
 */
export async function getUpdatedElectronVersions(
): Promise<Array<ElectronVersion>> {
  try {
    await fetchVersions();
  } catch (error) {
    console.warn(`Versions: Failed to fetch versions`, { error });
  }

  return getElectronVersions();
}

/**
 * Fetch the latest known versions directly from npm.
 *
 * @returns {Promise<Array<NpmVersion>>}
 */
export async function fetchVersions() {
  const response = await window.fetch(`https://registry.npmjs.org/electron`);
  const data = await response.json();
  const versions: Record<string, any> = data.versions;

  const output: Array<NpmVersion> = Object
    .keys(versions)
    .map((version) => ({ version }));

  if (output && output.length > 0 && isExpectedFormat(output)) {
    console.log(`Fetched new Electron versions (Count: ${output.length})`);
    saveKnownVersions(output);
  }

  return output;
}

/**
 * Is the given array an array of versions?
 *
 * @param {Array<any>} input
 * @returns {boolean}
 */
export function isExpectedFormat(input: Array<any>): boolean {
  return input.every((entry) => !!entry.version);
}

/**
 * Migrates old versions, if necessary
 *
 * @param {Array<any>} input
 * @returns {Array<NpmVersion>}
 */
export function migrateVersions(input: Array<any> = []): Array<NpmVersion> {
  return input
    .filter((item) => !!item)
    .map((item) => {
      const { tag_name, name, url } = item;

      if (!tag_name || !name || !url) return null;

      return {
        version: tag_name,
        name,
        localPath: url
      };
    })
    .filter((item) => !!item) as Array<NpmVersion>;
}

export function isElectronVersion(
  input: NpmVersion | ElectronVersion
): input is ElectronVersion {
  return (input as ElectronVersion).source !== undefined;
}
