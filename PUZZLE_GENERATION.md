# Puzzle generation and verification

No level in this game was made by scattering devices and hoping. Each one is
**constructed from a working solution**, then scrambled, then re-solved by an
independent solver before it is allowed into `src/levels/campaign.js`.

## The construction

`buildCandidate()` in `src/optics/generator.js`:

1. Put an emitter on a random edge, aimed inwards.
2. Walk the beam across the board in legs of one to three cells.
3. At the end of each leg, place a **mirror** turned to the exact angle that sends the
   beam into the next leg — or, sometimes, a **prism** whose green branch is the turn.
   Turning a prism to route green is a real mechanic, so the level teaches it.
4. Optionally pass the beam through a fixed **filter**, narrowing its colour.
5. End the beam in one of three ways:
   - a **receiver** at the next cell, requiring the colour that actually arrives;
   - a **portal** pair, with the receiver after the exit;
   - a **splitter**, with a receiver on each of its two branches.
6. Optionally add a **shutter network**: a gate sits on the winning beam, and a second
   emitter shines through a mirror onto a switch that opens it.

Because the walk places the devices on the path the beam itself takes, the finished
configuration is a solution by construction.

## The scramble

Every rotatable device is given a random rotation. Two rules:

- the scrambled board must **not** already be solved;
- the nearest solution must be **at least two turns away**, so no level is a single tap.

If 40 scrambles fail those rules, the candidate is rebuilt.

## The independent check

`inspectLevel()` (in `src/optics/solver.js`) enumerates every rotation combination of
every rotatable device — mirrors 2 states, prisms and splitters 4, filters 6 — evaluates
each one and records the solutions. With four devices that is at most a few hundred
evaluations, so the bake is exhaustive rather than heuristic.

A level ships only if:

- the structural rules pass (no overlaps, in bounds, an emitter, receivers, every gate
  has its switch, every portal has its partner);
- the constructed configuration really does light every crystal;
- the starting position is not already solved;
- the solver finds at least one solution;
- `minMoves` equals the distance from the scramble to the nearest solution.

`npm run check:levels` repeats all of that against the shipped file and exits non-zero on
any failure, so CI cannot publish a broken puzzle.

## What came out

| | |
| --- | --- |
| Levels | 200 (5 worlds × 40) |
| Levels with exactly one solution | 200 |
| With prisms | 94 |
| With filters | 42 |
| With splitters | 37 |
| With portals | 29 |
| With shutters (gate + switch) | 0 |
| With combiners | 0 |
| Difficulty spread | 1★ ×26, 2★ ×125, 3★ ×38, 4★ ×11 |

Within a world the levels are sorted by difficulty, so each room ramps instead of
bouncing with seed order.

## Honest gaps

- **Shutters do not appear in the shipped campaign.** The engine supports gates and
  switches and the tests cover them (a side beam opens a shutter and the main beam then
  finishes); the constructive placement needs a clear six-cell side arm on a busy board
  and the bake rejected every candidate that tried. Rather than ship a level with a
  cosmetic gate, gates are simply absent. Wiring them into hand-built introductory
  levels is the obvious next step.
- **Combiners have no campaign level either**, for the same reason: mixing needs two
  beams to meet, and the constructive builder only walks one. The device is implemented
  and tested in the engine.
- Levels are not checked for "explainable deduction only". Most are solvable by trial
  and error, which is fine for a casual puzzle, but nothing here proves a level can be
  reasoned to without guessing.
