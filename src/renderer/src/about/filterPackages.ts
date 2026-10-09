import type { ThirdPartyPackage } from '../../../shared/about'

/** Packages whose name or license contains the query (case-insensitive); all when it is blank. */
export function filterPackages(packages: ThirdPartyPackage[], query: string): ThirdPartyPackage[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return packages
  return packages.filter(
    (pkg) => pkg.name.toLowerCase().includes(needle) || pkg.license.toLowerCase().includes(needle)
  )
}
