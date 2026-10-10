import { useEffect, useState, type ReactNode } from 'react'
import type { AboutInfo, ThirdPartyPackage } from '../../../shared/about'
import { errorMessage } from '../quiz/errorMessage'
import { filterPackages } from './filterPackages'

const AWESOME_RESOURCES_URL = 'https://github.com/ashishps1/awesome-system-design-resources'
const TLDRAW_LICENSE_PAGE = 'https://tldraw.dev/community/license'

/** External links open in the OS browser (window open handler of the main process). */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

const preStyle = {
  whiteSpace: 'pre-wrap',
  fontSize: '0.85em',
  background: 'var(--color-surface-elevated)',
  padding: 8,
  overflowX: 'auto'
} as const

function LicenseTexts({ pkg }: { pkg: ThirdPartyPackage }) {
  if (pkg.licenseFiles.length === 0) {
    return (
      <p>
        The package ships no license file; its package.json declares <code>{pkg.license}</code>.
      </p>
    )
  }
  return (
    <>
      {pkg.licenseFiles.map((file) => (
        <div key={file.file}>
          <p style={{ margin: '8px 0 4px' }}>
            <code>{file.file}</code>
          </p>
          <pre style={preStyle}>{file.text}</pre>
        </div>
      ))}
    </>
  )
}

/** tldraw is not MIT: its license key and watermark obligations are shown in full. */
function TldrawLicense({ packages }: { packages: ThirdPartyPackage[] }) {
  const tldraw = packages.find((pkg) => pkg.name === 'tldraw')
  const licenseUrl = tldraw
    ? `https://github.com/tldraw/tldraw/blob/v${tldraw.version}/LICENSE.md`
    : 'https://github.com/tldraw/tldraw/blob/main/LICENSE.md'
  return (
    <section data-testid="about-tldraw">
      <h2>tldraw (Design Canvas)</h2>
      <p>
        {packages.map((pkg) => `${pkg.name} ${pkg.version}`).join(', ')} are under the{' '}
        <ExternalLink href={licenseUrl}>tldraw license</ExternalLink>, a source-available license,
        not MIT or another open source license (
        <ExternalLink href={TLDRAW_LICENSE_PAGE}>license page</ExternalLink>).
      </p>
      <ul>
        <li>
          Under its default terms it permits use in development only. A production build needs a
          valid license key (<code>VITE_TLDRAW_LICENSE_KEY</code>); without one, tldraw stops
          rendering the canvas after 5 seconds.
        </li>
        <li>
          This app is meant to run with a tldraw hobby license key, under which the &quot;made with
          tldraw&quot; watermark must be shown on the canvas. In development, without a key, the
          canvas shows a &quot;Get a license for production&quot; watermark. The app does not hide
          either watermark.
        </li>
        <li>
          The license forbids disabling, changing or interfering with its license key enforcement
          and removing copyright or other notices, and requires a verbatim copy of the license in
          any distribution (below).
        </li>
      </ul>
      {tldraw && (
        <details>
          <summary>tldraw license text</summary>
          <LicenseTexts pkg={tldraw} />
        </details>
      )}
    </section>
  )
}

function ThirdPartyLicenses({ about }: { about: AboutInfo }) {
  const [query, setQuery] = useState('')
  const { packages } = about.licenses
  const shown = filterPackages(packages, query)
  return (
    <section data-testid="about-licenses">
      <h2>Third-party licenses</h2>
      <p>
        {packages.length} packages. Rule: {about.licenses.rule}
      </p>
      <p>
        <label>
          Filter by name or license{' '}
          <input
            type="search"
            data-testid="about-licenses-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {shown.map((pkg) => (
          <li key={`${pkg.name}@${pkg.version}`} data-testid="about-license-entry">
            <details>
              <summary>
                {pkg.name} {pkg.version}: <code>{pkg.license}</code>
                {pkg.special === 'tldraw' && ' (tldraw license, see above)'}
              </summary>
              {pkg.special === 'electron' && (
                <p>
                  The app runtime. The Electron binary also contains Chromium, Node.js and other
                  components under their own licenses; Electron distributions ship their notices
                  next to the binary (LICENSES.chromium.html). They are not reproduced here.
                </p>
              )}
              <LicenseTexts pkg={pkg} />
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** App version, CC BY 4.0 attribution of the primer, generated-content notices, licenses. */
export function AboutScreen({ onClose }: { onClose: () => void }) {
  const [about, setAbout] = useState<AboutInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getAbout()
      .then(setAbout)
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [])

  const header = (
    <header style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <button type="button" onClick={onClose}>
        Back
      </button>
      <h1 style={{ fontSize: '1.4em', margin: 0 }}>About</h1>
    </header>
  )

  if (!about) {
    return (
      <main style={{ padding: 16 }}>
        {header}
        {error ? <p role="alert">{error}</p> : <p>Loading...</p>}
      </main>
    )
  }

  const { primer } = about
  const tldrawPackages = about.licenses.packages.filter((pkg) => pkg.special === 'tldraw')
  return (
    <main
      data-testid="about-screen"
      style={{ maxWidth: '80ch', margin: '0 auto', padding: 16, lineHeight: 1.5 }}
    >
      {header}
      <p data-testid="about-app">
        <strong>{about.appName}</strong> version {about.appVersion}. Licensed under Apache-2.0.
      </p>

      <section data-testid="about-primer">
        <h2>The System Design Primer</h2>
        <p data-testid="about-attribution">{primer.attribution}</p>
        <ul>
          <li>
            Source:{' '}
            <ExternalLink href={primer.permalink}>
              {primer.repository} at commit {primer.commitSha}
            </ExternalLink>{' '}
            (fetched {primer.fetchedAt})
          </li>
          <li>
            License: <ExternalLink href={primer.licenseUrl}>{primer.licenseName}</ExternalLink>
          </li>
        </ul>
        <p>The primer&apos;s own license notice:</p>
        <pre style={preStyle} data-testid="about-upstream-notice">
          {primer.upstreamNotice}
        </pre>
        <h3>Modifications</h3>
        <p data-testid="about-modifications">{primer.modifications}</p>
        <p data-testid="about-generated-notice">
          The content shown in the app is adapted from the primer: excerpts are split, summarised,
          rephrased and expanded into LLM-generated lessons and quizzes. It is not endorsed by the
          original author or the primer&apos;s contributors.
        </p>
        <p>{primer.thirdPartyContent}</p>
      </section>

      <section data-testid="about-generated">
        <h2>Generated content</h2>
        <ul>
          <li>
            Lessons, remediation lessons, quizzes, grading and design feedback are generated by an
            LLM (Claude, through the Claude Code CLI). They may contain errors: check important
            facts against the cited source sections.
          </li>
          <li>
            Foundations Module content (marked &quot;outside primer&quot;) is generated from the
            model&apos;s own knowledge and is not grounded in any source.
          </li>
          <li>
            <ExternalLink href={AWESOME_RESOURCES_URL}>
              ashishps1/awesome-system-design-resources
            </ExternalLink>{' '}
            (GPL-3.0) is not bundled and none of its content is shipped; it is at most an
            inspiration for design ideas.
          </li>
        </ul>
      </section>

      {tldrawPackages.length > 0 && <TldrawLicense packages={tldrawPackages} />}
      <ThirdPartyLicenses about={about} />
    </main>
  )
}
