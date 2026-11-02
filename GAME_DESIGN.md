# Game design

## The loop

A board of tiles, a light emitter on one edge, and one to three crystals that need
light. Some of the tiles hold optics: mirrors you can turn, prisms that split white
light, filters that strip channels away, splitters that share a beam, portals, and
shutters that stay shut until a side beam finds its switch.

Tap an optic to turn it. The beam re-traces instantly. Light every crystal at once and
the board completes.

There is no timer, no move limit, no failure state. The only cost of experimenting is
that your turn count decides the stars.

## Stars

| Stars | Condition |
| --- | --- |
| ★ | Solve it |
| ★★ | Solve within `minMoves + 2` turns |
| ★★★ | Solve in `minMoves`, the fewest possible from the starting scramble |

`minMoves` is computed by the solver, not guessed: it is the Hamming distance from the
scrambled start to the nearest valid solution.

## Worlds

| # | Room | New idea | Board |
| --- | --- | --- | --- |
| 1 | The Reflection Garden | Mirrors, one beam, one crystal | 5×5 |
| 2 | Rainbow Workshop | Prisms split white into red/green/blue; filters strip channels | 6×6 |
| 3 | Crystal Caverns | Splitters: one beam, two crystals | 7×7 |
| 4 | Starlight Observatory | Portals jump the beam across the board | 8×8 |
| 5 | The Grand Prism Palace | Everything at once, longer routes | 9×9 |

Within each room the puzzles are ordered by measured difficulty, so the ramp is real
rather than a renamed seed.

## Why it is not just "turn things until it works"

Four separate ideas do the work:

1. **Colour is a constraint, not decoration.** A crystal asks for a specific mix and
   refuses too much of anything else. A white beam cannot light a red crystal.
2. **Splitting weakens.** A splitter halves the beam, so a crystal that demands a bright
   beam needs the whole one.
3. **The board fights back.** Every mirror on the path must be right at the same time;
   one wrong angle usually sends the beam into a wall.
4. **Some routes only open sideways.** A gate on the winning path needs a switch lit by a
   different beam.

## Modes

- **Journey** — 200 puzzles, five rooms, stars and unlocks.
- **Daily** — one puzzle derived from the UTC date, identical for everyone. Uses
  `LEVELS[(dayNumber * 7919) % 200]`, which is stable forever because the baked
  campaign is fixed.
- **Zen** — a random mid-difficulty board, unlimited hints, no pressure.
- **Free play** — replay any solved puzzle to chase three stars.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Turn a device | Click it | Tap it |
| Undo / redo | Buttons | Buttons |
| Hint | `?` button | `?` button |
| Restart | `⟳` button | `⟳` button |

A hint comes from the solver: it finds the nearest solution from the *current* board and
points at the device that differs. It is never a guess.

## Progression and unlocks

- A level opens when the previous one is solved.
- A room opens when the previous rooms hold enough stars (20, 55, 95, 140).
- Twelve awards cover first solves, prisms, splitters, portals, shutters, perfect star
  runs, crystal counts and full completion.

## Accessibility

- Colour is never the only signal: crystals show a filled diamond, filters show a letter,
  and beams are drawn with a white core over their colour.
- Reduced motion stops drifting motes and shortens the tweens.
- High contrast strengthens outlines.
- The whole game is a fixed 720×1080 canvas scaled to fit, so it works on any window size
  without layout reflow.
