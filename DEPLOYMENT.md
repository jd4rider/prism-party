# Deployment

## Web

GitHub Pages, published from `.github/workflows/pages.yml` on every push to `main`.

```
https://jd4rider.github.io/prism-party/play/     ← the game
https://jd4rider.github.io/prism-party/          ← redirect to ./play/
```

The build uses `base: './'` so the same `dist-web` folder works at `/`, `/play/` or
`file://` inside Electron without changes. The workflow stages the bundle under
`site/play/` before uploading, which is why the play URL has `/play/` in it like the
other arcade games.

CI runs, in this order:

1. `npm run check:levels` — re-solves all 200 puzzles and fails on any broken one
2. `npm test` — the optical engine and solver suite
3. `npm run build`

## Desktop

Electron wraps `dist-web/index.html` with `sandbox: true`, `contextIsolation: true` and
no Node integration. External links open in the system browser.

```bash
npm run build
npx electron-builder --mac --publish never     # or --win / --linux
gh release upload v0.1.0 "dist/Prism Party-0.1.0-arm64.dmg" --clobber
open "dist/mac-arm64/Prism Party.app"          # or copy it to /Applications
```

`.github/workflows/release.yml` runs the same on a `v*` tag and attaches the macOS DMGs,
the Windows NSIS installer and the Linux AppImage to a GitHub release, which is what makes
the download buttons appear in the arcade catalogue.

## The subdomain

`https://prismparty.littlejoyarcade.site` is the intended permanent home and is **not**
enabled.

Adding `public/CNAME` with that hostname would make GitHub Pages serve the build from the
subdomain and 301 the `github.io` URL to it. The arcade catalogue links the `github.io`
URL, so flipping the CNAME before the other games move would break the catalogue link
until DNS and the certificate catch up. The portal already resolves preferred URLs by
probing them (`src/lib/playUrl.ts`), so the switch can happen per game once the record
exists.

To enable it later:

1. `CNAME` → `prismparty.littlejoyarcade.site` in `public/`.
2. `CNAME` record at the DNS provider pointing to `jd4rider.github.io`.
3. Wait for the certificate, then confirm the subdomain serves the game over HTTPS.
4. Update `playUrl` in the catalogue to the subdomain.

## Release checklist

- [x] `npm run check:levels` passes with 200/200
- [x] `npm test` passes
- [x] `npm run build` is clean
- [x] Pages workflow green
- [x] Live URL loads, plays and saves (16/16 headless checks against the deployed build)
- [x] Catalogue row published with the live play URL
- [x] `v0.1.0` tagged with both macOS DMGs attached
- [ ] Subdomain enabled (see above)
