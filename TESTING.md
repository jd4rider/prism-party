# Testing

```bash
npm test              # node:test — engine, solver, generator
npm run check:levels  # re-solve all 200 shipped puzzles
npm run build         # production bundle
npm run smoke         # headless browser: menu → puzzle → solve → result
```

## What the unit tests cover

`src/optics/optics.test.js`:

- mirror tables turn every incoming direction by exactly 90°, both diagonals, and
  `mirrorRotationFor` inverts the table;
- a beam reflects off a mirror into a receiver, and the wrong rotation misses;
- a blocker leaves a crystal dark;
- a prism fans white light into red, green and blue along the documented directions;
- a prism cannot light a red crystal with its green branch, and turning it can;
- prism output never exceeds the light that entered, per channel;
- filters pass their channels and drop the rest, and a rotatable filter cycles six masks;
- receivers reject a bright beam with too much unwanted colour;
- splitters halve the beam, and a split beam fails a demanding `minIntensity`;
- portals carry a beam across the board;
- a gate blocks until a side beam turns its switch on;
- combiners take two beams and do not turn white into yellow;
- two mirrors facing each other terminate in a bounded number of rays;
- evaluation is deterministic and identical when devices are reordered;
- the solver finds solutions and counts them, and `moveDistance` behaves;
- structural validation catches a missing receiver, overlapping devices and a gate
  pointing at a switch that does not exist;
- difficulty rises when more devices must be turned;
- every world can generate a board whose constructed configuration actually solves.

## Level verification

`scripts/check-levels.mjs` runs in CI before the build. It fails the release if any level
is structurally invalid, starts solved, has a stored solution that does not solve it, has
no solution, has a `minMoves` that disagrees with the solver, or if the campaign is not
200 levels.

## Browser checks

`scripts/smoke.mjs` drives the built game in headless Chrome through `playwright-core`
and the locally installed Chrome:

1. the menu renders and the Phaser game boots;
2. tapping Journey opens the world list;
3. opening a level renders the board with the expected device count;
4. tapping a mirror turns it (the rotation actually changes);
5. solving the board — applying the stored solution through the same rotate path the
   touch handler uses — reaches the results panel and records stars;
6. reloading keeps the saved stars;
7. no uncaught page errors.

It also writes screenshots to `/tmp/prism-*.png` for a visual pass.
