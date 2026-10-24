---
title: Attribution and Licenses
tags: [license, product]
issue: [19, 44]
---

# Attribution and Licenses

What the About screen shows, why, and how to keep it right. Context: [[SPEC]] section 4.1, [[Corpus]], [[Design Canvas Integration]].

> [!note] Not legal advice
> This note restates what the licenses and the repo's earlier findings say. Points marked "open" are not settled.

## What the About screen shows

Opened from the **About** item of the app header ([[Design System#App shell]]) (`src/renderer/src/about/AboutScreen.tsx`).

| Section | Content | Why |
|---|---|---|
| App | Name, version (`app.getVersion()`), Apache-2.0 | Identify the build. |
| The System Design Primer | `metadata.attribution`, a link to the repository at the pinned commit, `metadata.license` name and link, the primer's own License section verbatim (`metadata.license.upstreamNotice`), `metadata.modifications`, `metadata.thirdPartyContent` | CC BY 4.0 asks for credit, a link to the license, the notices kept, and an indication of changes ([[Corpus#License obligations]]). |
| Modification notice | Content is adapted (split, summarised, rephrased, expanded) into LLM-generated lessons and quizzes; not endorsed by the original author or contributors | CC BY 4.0 gives no permission to imply endorsement (section 2(a)(6)). |
| Generated content | Lessons, quizzes, grading and design feedback are LLM-generated and may contain errors; [[Foundations Module]] content is not grounded in a source; `ashishps1/awesome-system-design-resources` (GPL-3.0) is not bundled (inspiration only) | [[SPEC]] sections 4.1 and 4.2. |
| Third-party licenses | Every shipped package: name, version, license, license file texts; filterable | Most licenses (MIT, ISC, BSD, 0BSD) require keeping the copyright and permission notice. |

The primer fields are read from the [[Source Corpus]] metadata (`resources/corpus/primer.json`) over IPC, never hard-coded, so they follow a corpus refresh. Static notices (generated content, Foundations Module, GPL repo) live in the screen component.

## The Design Canvas dependency

The Design Canvas runs on React Flow (`@xyflow/react` and `@xyflow/system`, both MIT), so every npm package the app ships is under a permissive license and needs no section of its own: it is listed in the third-party list below like the others. The app first used tldraw, a source-available license that required a license key and a watermark; that was removed in issue #44 together with the packages, the vendored license text and the About section. History: [[tldraw|tldraw spike]], [[react-flow|React Flow spike]].

## Fonts

The UI fonts are self-hosted, never fetched: Geist (`@fontsource-variable/geist`, UI text of the Dark theme), Plus Jakarta Sans (`@fontsource-variable/plus-jakarta-sans`, UI text of the Light theme, copyright the Plus Jakarta Sans Project Authors) and JetBrains Mono (`@fontsource-variable/jetbrains-mono`), all under the SIL Open Font License 1.1 (OFL-1.1). They are production `dependencies`, so they are listed in the third-party licenses below with their `LICENSE` text (the OFL requires keeping the copyright and license notice). Vite inlines the `.woff2` files as `data:` URLs (`electron.vite.config.ts`), which the CSP allows (`font-src 'self' data:`). See [[Design System#Fonts]].

## Third-party license list

`resources/licenses.json`, written by `scripts/build-licenses.ts` (logic in `src/main/about/licenses.ts`).

**Rule**: every package that `package-lock.json` does not mark `dev` (the production dependency tree of `dependencies`: react, react-dom, react-markdown, remark-gfm, mermaid, @xyflow/react, html-to-image, dompurify, zod, the three `@fontsource-variable` font packages and their transitive dependencies), plus `electron`, a devDependency that is the app's runtime (its own dependencies are install-time only). It is a superset of what the bundles contain, chosen because it is checkable from the lockfile alone. Duplicates (same name and version) are listed once.

- License id: the lockfile `license` field (SPDX).
- Texts: files named `LICENSE*`, `LICENCE*`, `COPYING*`, `NOTICE*` in the installed package, line endings normalized. A package without such a file (for example `react-remove-scroll-bar`) shows its declared license only.
- Electron: only its own `LICENSE`. The Chromium, Node.js and other notices ship with Electron as `LICENSES.chromium.html` (about 19 MB) next to `Electron.app`; they are not copied into the list. The packaging step keeps them: `electron-builder.yml` copies that file and Electron's `LICENSE` into `Contents/Resources` of the app, and `scripts/check-package.mjs` fails `npm run package` if either is missing ([[Packaging]]).
- Deterministic: sorted by name then version, no timestamp. No network.

### Refreshing

The file is committed. After any change to `package-lock.json`:

```bash
npm ci                    # the script reads license files from node_modules
npm run licenses:build    # rewrite resources/licenses.json
npm run licenses:check    # exit 1 if the committed file differs from a fresh build
```

`npm test` fails while the file is stale against the lockfile (`src/main/about/licenses.test.ts` compares name, version and license, without node_modules). `npm run build` does not run the script and needs no network.

## In code

- `src/shared/about.ts`: `AboutInfo`, `LicensesFile`, `ThirdPartyPackage` (`special` is only `electron`).
- `src/main/about/aboutData.ts`: `assembleAbout`, zod schemas validating the corpus metadata and the licenses file before they cross IPC (`app:getAbout`).
- `src/main/about/index.ts`: `createAboutIpc` (reads `resources/licenses.json` on first call).
- `src/main/about/licenses.ts`: `shippedPackages`, `buildLicensesFile`, `staleEntries`.
- `src/renderer/src/about/`: About screen.
