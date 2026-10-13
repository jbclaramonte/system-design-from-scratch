/**
 * Data of the About screen: app version, the primer attribution (read from the Source Corpus
 * metadata, never hard-coded) and the third-party licenses (resources/licenses.json, written by
 * scripts/build-licenses.ts). See docs/Attribution and Licenses.md.
 */

/** A license file shipped in a package, verbatim. */
export interface LicenseFile {
  file: string
  text: string
}

/** Why an entry needs more than its license text. */
export type SpecialPackage =
  /** Electron runtime: a devDependency in package.json, but it is the app's runtime. */
  'electron'

export interface ThirdPartyPackage {
  name: string
  version: string
  /** SPDX expression, as declared by the package. */
  license: string
  /** Empty when the package ships no license file. */
  licenseFiles: LicenseFile[]
  special: SpecialPackage | null
}

/** Content of resources/licenses.json. */
export interface LicensesFile {
  schemaVersion: 1
  generator: string
  /** Which packages are listed, in plain words. */
  rule: string
  /** Sorted by name, then version. */
  packages: ThirdPartyPackage[]
}

/** CC BY 4.0 attribution of the System Design Primer, from the Source Corpus metadata. */
export interface PrimerAttribution {
  repository: string
  repositoryUrl: string
  commitSha: string
  /** The repository at the pinned commit. */
  permalink: string
  fetchedAt: string
  licenseName: string
  licenseSpdx: string
  licenseUrl: string
  /** The primer's own License section, verbatim. */
  upstreamNotice: string
  attribution: string
  modifications: string
  thirdPartyContent: string
}

export interface AboutInfo {
  appName: string
  appVersion: string
  primer: PrimerAttribution
  licenses: LicensesFile
}
