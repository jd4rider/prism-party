# Prism Party

A 2.5D light-routing puzzle for [Little Joy Arcade](https://littlejoyarcade.site).
Turn mirrors, split the spectrum and light every crystal.

- **Play:** <https://jd4rider.github.io/prism-party/play/>
- **Planned host:** <https://prismparty.littlejoyarcade.site>
- **Stack:** Phaser 4, Vite, plain ES modules, `node:test`

## Run it

```bash
npm install
npm run dev        # http://localhost:5183
npm test           # optical engine, solver and generator tests
npm run check:levels   # re-solves all 200 shipped puzzles
npm run build      # dist-web/
npm run desktop    # Electron shell around dist-web/
```

## What is here

```
src/
  optics/          pure engine — no Phaser, no DOM
    model.js       directions, colours, device transformations
    engine.js      beam tracing and the fixed-point device loop
    solver.js      exhaustive solver, solution counting, difficulty
    generator.js   constructive level builder
    optics.test.js
  levels/
    campaign.js    generated, verified data — do not hand edit
  phaser/          presentation only
    PuzzleScene.js the board, the beams, the HUD
    draw.js        2.5D device art
    common.js      layout, buttons, panels, effects
    MenuScene.js WorldsScene.js LevelsScene.js
    SettingsScene.js AchievementsScene.js
  save.js progress.js achievements.js theme.js sound.js
electron/          desktop wrapper
scripts/           bake-levels, check-levels, make-icon
```

The rule that keeps this maintainable: **the puzzle is solved by `src/optics`, never by
the renderer.** A beam's position on screen has no effect on whether a crystal lights.

## Documentation

- [GAME_DESIGN.md](GAME_DESIGN.md) — mechanics, worlds, modes, scoring
- [OPTICAL_ENGINE.md](OPTICAL_ENGINE.md) — the exact light rules
- [PUZZLE_GENERATION.md](PUZZLE_GENERATION.md) — how levels are made and verified
- [LEVEL_FORMAT.md](LEVEL_FORMAT.md) — the shipped data shape
- [ARCADE_INTEGRATION.md](ARCADE_INTEGRATION.md) — Little Joy Arcade hooks
- [DEPLOYMENT.md](DEPLOYMENT.md) — Pages, desktop builds, the subdomain
- [TESTING.md](TESTING.md) — what is checked and how
