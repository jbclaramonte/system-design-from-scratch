---
title: Website
tags: [product, website]
issue: 56
---

# Website

A one-page site for the app, hosted on GitHub Pages at `https://jbclaramonte.github.io/system-design-from-scratch/`: what the app is, how a session goes shown with screenshots of the real app, the download, the requirements, what the app is not, and the attribution of the [[Source Corpus]] with the license notices ([[Attribution and Licenses]]). Source in `site/`, deployment by `.github/workflows/pages.yml`. Context: [[Packaging]] (the releases the page links to), [[SPEC]].

## What is in `site/`

| Path | What |
|---|---|
| `site/index.html` | The page, in English. Plain HTML: no framework, no build step, no script. |
| `site/assets/style.css` | The styles. Light and dark theme follow the system (`prefers-color-scheme`); tokens follow the app's dark theme ([[Design System]]). Fonts are self-hosted (see the Fonts note below). |
| `site/assets/img/*.webp` | The screenshots, 2x WebP, each under 250 KB. |
| `site/assets/icon-*.png` | The app icon (copies of `build/icons/`). |

The page makes no request to any other site: no analytics, cookies, external font or script. Its links to GitHub and to the primer are plain anchors. It is responsive down to phone width, has one `h1` and no skipped heading level, alt text on every image (they carry the content: the screenshots are in French), a skip link, visible focus and contrast of at least 4.5:1 in both themes.

> [!note] Fonts
> The page self-hosts the app's fonts, Geist and JetBrains Mono (OFL-1.1): the two `*-latin-wght-normal.woff2` files of the `@fontsource-variable` packages and their `LICENSE` texts live in `site/assets/fonts/`, declared by `@font-face` rules in `style.css` (system fonts as fallback) and credited in the Attribution section of the page. To update them after a package upgrade, copy the files again (`site:check` refuses a font fetched from another site).

The screenshots show the course in French, the default [[Generation Language]], and the page says so. The page is English only (the open question of an added French version is left to the owner).

### Download section

No version number is written anywhere in the page (`site:check` fails on one): the links point at `releases/latest`, and the macOS command is the `install.sh` one-liner of the README, which installs the latest release. `site:check` also checks that the command is the README's.

### Attribution

The primer's attribution, license, modification notice and the "not endorsed" sentence repeat what the About screen shows (`resources/corpus/primer.json` metadata, see [[Attribution and Licenses#What the About screen shows]]). The page pins the same primer commit; `site:check` fails when the commit, the license URL or the modification text differ from the corpus metadata, so a corpus refresh (`npm run corpus:build`) must be followed by an update of the page.

## Checking the page

```bash
npm run site:check                 # offline: local links, anchors, images, headings, attribution, sizes
node scripts/check-site.mjs --external   # also requests every external link
npx prettier --check site          # part of npm run format:check
```

Before publishing a change, open `site/index.html` in a browser at desktop and phone widths, in light and dark. The check done for #56 (Chrome, 1280 and 390 px wide, both color schemes): no horizontal scroll, no broken image, every external link answered 200.

## Refreshing the screenshots

`scripts/site-screenshots.mjs` (`npm run site:screenshots`) drives the **packaged** app, so the Learning Path locks apply and the new Forced Unlock and Declared Mastery are what reach each screen. It needs a scratch data folder and the real Claude Code CLI, logged in:

```bash
npm run package:dir
node scripts/site-screenshots.mjs --user-data-dir /path/to/empty/scratch/folder
# a trial run with no Generation at all: --cli /path/to/a/fake/claude
```

What it does, in the order of the page:

1. Learning Path: "I already know this" on the first Foundations topic (Declared Mastery), "Unlock anyway" on a Foundations topic, on the primer topic taught (`load-balancer`) and on Exercise 1 (Forced Unlock). Shots `path-topics`, `path-exercises`.
2. The lesson of the primer topic (Notion Outline, Lesson with a diagram, and the quiz the app pre-generates meanwhile), then a Lesson Question on a selected passage. Shots `lesson`, `lesson-ask`.
3. The quiz: a question reworded ("I don't understand the question"), a wrong answer with its feedback, the correct answers to the others (read from the scratch database, where the app keeps its own answer key), the model answer typed as the free answer (graded for real), the results and the Remediation Lesson of the one missed notion. Shots `quiz-clarify`, `quiz-feedback`, `remediation`.
4. Dashboard and Notion Map. Shots `dashboard`, `notion-map`.
5. Exercise 1: a drawing written into the scratch database (a paste service, High-level design step) and the two Protocol Step Lessons marked as read, so the app does not generate them; then "Submit for feedback" for the real Design Feedback. Shots `design-canvas`, `design-feedback`. `--only-exercise` reruns this last stage on a folder a previous run left, after a failure there.

Images are 1280 px wide at 2x, captured by Chromium as WebP (`Page.captureScreenshot`), the quality lowered until each is under 245 KB, and written to `site/assets/img/` (or `--out`). The script refuses a data folder that looks like the real one or already holds a database, passes `--user-data-dir` to the app, and kills the app it started when it ends.

> [!warning] It spends real Generations
> A run makes about ten CLI calls on your Claude plan (outline, lesson, quiz, Lesson Question, clarification, free-answer grading, Remediation Lesson, the quiz pre-generated after it, Design Feedback). Content is French and differs from one run to the next. The script stops at the first failure and keeps the scratch folder, with no retry. Look at every image before committing it: **no file path with a user name and no email may show** (the Settings screen, whose CLI test prints the account, is not captured) and the content must read like a course.

The Design Feedback step needs the window to keep rendering: the PNG export of a canvas waits for animation frames and times out ("is the window visible?") when the window is occluded or the display is asleep. The script passes Chromium's `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows` to the app.

## Deployment

`.github/workflows/pages.yml` runs on a push to `main` that touches `site/**`, and by hand (`workflow_dispatch`). Two jobs: `build` runs `node scripts/check-site.mjs` then `actions/configure-pages` and `actions/upload-pages-artifact` (the `site/` folder); `deploy` runs `actions/deploy-pages` in the `github-pages` environment. Versions are pinned by major tag like the other workflows (`@v6`, `@v5`, `@v5`).

> [!important] One setting, by the owner
> Pages must be switched to the **GitHub Actions** source (repository Settings > Pages) once. Until then the workflow cannot deploy. Nothing in the repo changes that setting.

The canonical URL and the README link point at the address above; it answers 404 until the first deployment.

## Related

- [[Packaging]], [[Attribution and Licenses]], [[Design System]], [[Generation Language]], [[Learning Path Implementation]]
