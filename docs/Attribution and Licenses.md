---
title: Attribution and Licenses
tags: [license, product]
issue: 19
---

# Attribution and Licenses

What the About screen shows, why, and how to keep it right. Context: [[SPEC]] section 4.1, [[Corpus]], [[Design Canvas Integration]], [[tldraw|tldraw spike]].

> [!note] Not legal advice
> This note restates what the licenses and the repo's earlier findings say. Points marked "open" are not settled.

## What the About screen shows

Opened from the **About** button in the home header (`src/renderer/src/about/AboutScreen.tsx`).

| Section | Content | Why |
|---|---|---|
| App | Name, version (`app.getVersion()`), Apache-2.0 | Identify the build. |
| The System Design Primer | `metadata.attribution`, a link to the repository at the pinned commit, `metadata.license` name and link, the primer's own License section verbatim (`metadata.license.upstreamNotice`), `metadata.modifications`, `metadata.thirdPartyContent` | CC BY 4.0 asks for credit, a link to the license, the notices kept, and an indication of changes ([[Corpus#License obligations]]). |
| Modification notice | Content is adapted (split, summarised, rephrased, expanded) into LLM-generated lessons and quizzes; not endorsed by the original author or contributors | CC BY 4.0 gives no permission to imply endorsement (section 2(a)(6)). |
| Generated content | Lessons, quizzes, grading and design feedback are LLM-generated and may contain errors; [[Foundations Module]] content is not grounded in a source; `ashishps1/awesome-system-design-resources` (GPL-3.0) is not bundled (inspiration only) | [[SPEC]] sections 4.1 and 4.2. |
| tldraw | License name and links, obligations (below), the full license text | tldraw is not MIT. |
| Third-party licenses | Every shipped package: name, version, license, license file texts; filterable | Most licenses (MIT, ISC, BSD, 0BSD) require keeping the copyright and permission notice. |

The primer fields are read from the [[Source Corpus]] metadata (`resources/corpus/primer.json`) over IPC, never hard-coded, so they follow a corpus refresh. Static notices (generated content, Foundations Module, GPL repo) live in the screen component.

## tldraw

`tldraw`, `@tldraw/editor`, `@tldraw/assets` and `@tldraw/driver` declare `SEE LICENSE IN LICENSE.md` (listed as `LicenseRef-tldraw`); the other `@tldraw/*` packages declare MIT. The npm packages only ship a one-line pointer, so the full text of the tldraw license at the pinned version is vendored in `resources/licenses/tldraw-v5.5.2-LICENSE.md` (from `https://github.com/tldraw/tldraw/blob/v5.5.2/LICENSE.md`) and shown with the `tldraw` entry. The license asks for "a verbatim copy of this License in any distribution".

Obligations shown on the screen, from [[tldraw|the spike]] and [[Design Canvas Integration#License key]]:

- Default terms permit development use only; a production build needs a valid license key (`VITE_TLDRAW_LICENSE_KEY`), otherwise tldraw stops rendering the canvas after 5 seconds.
- With the planned hobby key, the "made with tldraw" watermark must stay on the canvas; in dev the "Get a license for production" watermark shows. Nothing in the app hides either.
- No disabling or interfering with license key enforcement, no removal of notices.

> [!warning] Open
> The watermark tracking request blocked by the CSP ([[Design Canvas Integration#Open licensing question: watermark tracking request]]) is still to clarify with tldraw.

## Third-party license list

`resources/licenses.json`, written by `scripts/build-licenses.ts` (logic in `src/main/about/licenses.ts`).

**Rule**: every package that `package-lock.json` does not mark `dev` (the production dependency tree of `dependencies`: react, react-dom, react-markdown, remark-gfm, mermaid, tldraw, @tldraw/assets, zod and their transitive dependencies), plus `electron`, a devDependency that is the app's runtime (its own dependencies are install-time only). It is a superset of what the bundles contain, chosen because it is checkable from the lockfile alone. Duplicates (same name and version) are listed once.

- License id: the lockfile `license` field (SPDX), except the tldraw override above.
- Texts: files named `LICENSE*`, `LICENCE*`, `COPYING*`, `NOTICE*` in the installed package, line endings normalized. A package without such a file (for example `react-remove-scroll-bar`) shows its declared license only.
- Electron: only its own `LICENSE`. The Chromium, Node.js and other notices ship with Electron as `LICENSES.chromium.html` (about 19 MB) next to the binary; they are not copied into the list. Open: check that the packaging step keeps that file.
- Deterministic: sorted by name then version, no timestamp. No network.

### Refreshing

The file is committed. After any change to `package-lock.json`:

```bash
npm ci                    # the script reads license files from node_modules
npm run licenses:build    # rewrite resources/licenses.json
npm run licenses:check    # exit 1 if the committed file differs from a fresh build
```

`npm test` fails while the file is stale against the lockfile (`src/main/about/licenses.test.ts` compares name, version and license, without node_modules). `npm run build` does not run the script and needs no network.

When tldraw is bumped, the script stops until the license is re-vendored: download `LICENSE.md` at the new tag into `resources/licenses/`, update `TLDRAW_LICENSE_VERSION` in `scripts/build-licenses.ts`, and re-read the license for changed terms.

## In code

- `src/shared/about.ts`: `AboutInfo`, `LicensesFile`, `ThirdPartyPackage`.
- `src/main/about/aboutData.ts`: `assembleAbout`, zod schemas validating the corpus metadata and the licenses file before they cross IPC (`app:getAbout`).
- `src/main/about/index.ts`: `createAboutIpc` (reads `resources/licenses.json` on first call).
- `src/main/about/licenses.ts`: `shippedPackages`, `buildLicensesFile`, `staleEntries`.
- `src/renderer/src/about/`: About screen.
