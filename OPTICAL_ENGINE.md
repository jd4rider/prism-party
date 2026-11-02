# The optical engine

`src/optics/` is a pure simulation. It imports nothing from Phaser and touches no DOM,
so the same code runs in the browser, in the solver at bake time and in `node:test`.

## Conventions

**Directions** are `0 = north, 1 = east, 2 = south, 3 = west`, increasing clockwise.
`turn(direction, n)` rotates them and wraps.

**Colour is intensity.** A beam carries `{ r, g, b }` with each channel in `0..1`, and
there is deliberately no separate scalar intensity. The brief for this project warns
about multiplying intensity in twice; the way to make that impossible is to have only
one representation. "Brightness" is the sum of the channels, computed when it is needed.

Mixing is additive and clamped to `1`. Transmission losses are applied per channel, so
no device can create light: a prism splitting white light sends `0.92` of the red down
the red branch, `0.92` of the green down the green branch and `0.92` of the blue down the
blue branch. Total red out never exceeds red in.

## Tracing

`evaluate(level, rotations)` advances every emitter's beam through an explicit work
queue. Each step moves one cell and records a segment:

1. Take a ray at cell `(x, y)` heading `direction`.
2. Step to the neighbouring cell. Outside the board: the ray ends.
3. Record the segment (this is what the renderer draws).
4. If `(cell, direction, rounded colour)` has already been visited this pass, the ray
   ends. That is the loop guard, and it is why two mirrors facing each other cost four
   steps instead of hanging the tab.
5. Otherwise apply the device and push the outgoing rays.

There is no recursion and no randomness. Evaluation order cannot change the result,
because beams only ever accumulate into maps and every consumer is read after the walk.

The whole walk is capped at `MAX_RAYS = 900` as a belt-and-braces guard. A real board
uses a few dozen.

## Devices

| Device | Behaviour |
| --- | --- |
| **Emitter** | Starts a beam in its `rotation` direction with its `color`. Blocking. |
| **Mirror** | Reflects 90°. Two optical states, `/` and `\`, which is exactly what a double-sided diagonal can do. The UI cycles both, so tapping always changes the optics. |
| **Prism** | Splits the beam into its channels: red one step anticlockwise, green straight ahead, blue one step clockwise, the whole fan rotated by the device. Four rotations, all optically distinct. |
| **Filter** | Multiplies the beam by a mask. A fixed filter uses `pass`; a rotatable one cycles red, green, blue, yellow, cyan, magenta. |
| **Splitter** | Two outgoing rays at `dir + rotation` and `dir + rotation + 1`, each at half strength. Four rotations, four distinct pairs. |
| **Receiver** | Absorbs the beam and accumulates its colour. |
| **Portal** | Carries the beam to its partner and continues in the same direction plus the partner's rotation. |
| **Switch** | Absorbs the beam; on if anything brighter than `0.08` arrives. |
| **Gate** | Passes the beam only while its `switchId` switch is on. |
| **Combiner** | Accumulates incoming light and re-emits it in its rotation direction. Supported and tested, but no campaign level uses one yet — see PUZZLE_GENERATION.md. |
| **Blocker** | Absorbs the beam. |

## Receiver rules

A receiver lights when every required channel is bright enough **and** every unwanted
channel is quiet enough:

```
required channel:  value >= required * minIntensity   (default 0.45)
unwanted channel:  value <= maxLeak                   (default 0.16)
```

Without the leak test, every bright beam would satisfy every receiver and the colour
system would be decoration. With it, a white beam cannot light a red crystal (its blue
and green are over the leak limit), and a half-strength split beam cannot light a
crystal that asks for `minIntensity: 0.7`.

## Gates, switches and combiners

These devices depend on each other, so a single pass is not enough. `evaluate` runs a
bounded fixed-point loop (at most four passes):

```
world = { switches: {}, combiners: {} }
result = trace(world)
repeat until switches and combiners stop changing:
    world = result
    result = trace(world)
```

Pass 0 sees every gate closed. If a side beam reaches a switch, pass 1 sees it open. The
loop stops as soon as nothing changes, so an oscillating board (a gate powered by a
switch behind that same gate) simply settles on its final state rather than looping.

Combiners work the same way: a combiner emits the light it gathered on the previous pass,
once per pass, so queue order never decides the output.

## Why this is testable

`src/optics/optics.test.js` covers reflection tables, prism fan directions, energy
conservation, filter masks, receiver tolerance, splitter halving, portal routing,
switch/gate dependency, loop termination, determinism under device reordering, solver
correctness and structural validation. The solver tests are what make the claim "every
shipped level is solvable" checkable rather than hopeful.
