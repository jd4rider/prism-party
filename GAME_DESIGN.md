# Game design

## The loop

A board of tiles, a light emitter on one edge, and one to three crystals that need
light. Some of the tiles hold optics: mirrors you can turn, prisms that split white
light, filters that strip channels away, splitters that share a beam, portals, and
shutters that stay shut until a side beam finds its switch.

Tap an optic to turn it. The beam re-traces instantly. Light every crystal at once and
the board completes.

Many boards also have **sockets**: empty holes in the tray with nothing in them, and a
rack of loose pieces underneath. A socket does nothing until something is dropped into
it, so those boards cannot be solved by turning alone — you have to decide *which* piece
goes where, drag it in, and then turn it in place.

Other boards put **doors** across the route. A door is cut for one colour and only that
colour gets through, so a white beam has to be filtered down before it can pass. **Walls**
fill the empty tiles around the route, which is what stops a wrong turn from quietly
succeeding.

There is no timer, no move limit, no failure state. The only cost of experimenting is
that your turn count decides the stars.

## Stars

| Stars | Condition |
| --- | --- |
| ★ | Solve it |
| ★★ | Solve within `minMoves + 2` turns |
| ★★★ | Solve in `minMoves`, the fewest possible from the starting scramble |

`minMoves` is computed by the solver, not guessed: it is the number of actions between
the scrambled start and the nearest valid solution, where one action is a turn or one
piece going into (or out of) a socket. A piece can only be turned while it sits in a
socket, which is why turning a piece you just placed costs two.

## Worlds

| # | Room | New idea | Board |
| --- | --- | --- | --- |
| 1 | The Reflection Garden | Mirrors and the first sockets; walls start closing in | 5×5 |
| 2 | Rainbow Workshop | Prisms split white into red/green/blue; filters and colour doors | 6×6 |
| 3 | Crystal Caverns | Splitters share one beam; two and three sockets on a route | 7×7 |
| 4 | Starlight Observatory | Portals jump the beam; two emitters; dense walls | 8×8 |
| 5 | The Grand Prism Palace | Everything at once, six or seven actions deep | 9×9 |

Within each room the puzzles are ordered by measured difficulty, so the ramp is real
rather than a renamed seed.

## Why it is not just "turn things until it works"

Six separate ideas do the work:

1. **Some pieces are not on the board yet.** A socket is a hole: the beam passes straight
   through it and misses. The route only exists once the right piece is dragged in, and
   the tray usually carries a decoy that fits but splits the colour.
2. **Colour is a constraint, not decoration.** A crystal asks for a specific mix and
   refuses too much of anything else. A white beam cannot light a red crystal, and a door
   will not open for the wrong colour.
3. **Splitting weakens.** A splitter halves the beam, so a crystal that demands a bright
   beam needs the whole one.
4. **The board fights back.** Walls fill the spare tiles, so a wrong angle does not find a
   lucky second route — it dies.
5. **Direction counts.** A directional crystal only drinks from one side, marked on the
   glass.
6. **Some routes only open sideways.** A gate on the winning path needs a switch lit by a
   different beam.

## What the campaign is made of

Every board comes from one of nine hand-written archetypes, and each slot in a room asks
for a specific one so the campaign rotates instead of repeating:

| Archetype | The idea |
| --- | --- |
| chain | Turn the beam a few times into a crystal |
| maze | The same, with walls closing the wrong turns |
| labyrinth | Long route, ten or more walls, directional crystals |
| filterDoor | Filter the colour, then pass a door cut for it |
| prismFan | A prism fans white light into two crystals |
| splitPair | One beam shared by two crystals, at half brightness |
| placePiece | The route needs a piece that is still in the tray |
| twoSockets | The whole route has to be built from loose pieces |
| dualBeam | Two emitters, two crystals, no confusion allowed |
| portalRoute | The beam leaves through a portal and finishes elsewhere |

153 of the 200 boards need at least one piece dragged onto them; there are 265 pieces to
place and 1031 walls across the campaign.

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
| Place a piece | Drag it from the tray onto a socket | Drag it, or tap it then tap the socket |
| Turn a placed piece | Click it in its socket | Tap it in its socket |
| Take a piece back | Drag it out of the socket | Drag it out |
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
