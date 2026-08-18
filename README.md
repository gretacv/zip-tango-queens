# Zip, Tango & Queens

Three LinkedIn-style daily puzzles, except you never run out. Everything runs in one
self-contained HTML file — no server, no build step to play, no network. Open it and play.

**▶ [Play here](https://gretacv.github.io/zip-tango-queens/)**

## The games

| Game | Goal | Sizes |
| --- | --- | --- |
| **Zip** | Draw one line through every cell, meeting the numbers in order | 5×5 – 8×8 |
| **Tango** | Fill the grid with suns and moons, balanced and never three alike | 6×6, 8×8 |
| **Queens** | One crown per row, column and colour region, none touching | 5×5 – 9×9 |

Each game has undo, a timer, and best times kept per board size (in your browser's local
storage — nothing leaves your machine).

## Hints that reason, rather than reveal

Press **Hint** in Tango or Queens and it works out a step you could have made yourself,
says what settles it, and marks the squares its reasoning rests on:

> Two moons sit side by side in column 2, so a third here would make three in a row —
> this is a sun.

> A dot here: every square still open in the teal region lies in row 5, so that row's
> crown belongs to the teal region.

Press it a second time to take the step. If something already on the board is wrong, that
gets flagged first — there is no point deducing from a broken position.

The hints only offer steps that are checkable from what is actually on the board: a crown
is only proposed once the squares ruling out its neighbours are crowned or dotted, so a
hint never asserts eliminations you cannot see. Deductions run from the plainest rule
upward — what a placed crown rules out, then a region penned into one line, then what-if
(*a crown here would leave the amber region with nowhere to go*). Reasoning alone carries
100% of Tango boards and 87–100% of Queens boards depending on size; on the rest, the hint
says so plainly and names a square outright rather than inventing an explanation.

## Every puzzle has exactly one solution

That guarantee is the whole difficulty of generating these. A randomly built board is
almost always either ambiguous or impossible, so each generator works differently:

**Queens** lays down a valid set of crowns, grows the colour regions outward from them,
then repeatedly asks the solver for a *rival* solution and moves a single cell into a
neighbouring region to kill it. That move is always safe: the rival ends up with two
crowns in one region and none in another, while the real solution is untouched because
crown cells never move. Growing regions at random and hoping for uniqueness produced a
usable board about twice in 400 tries; this converges every time.

**Tango** starts from a filled grid with every clue present, then strips clues one at a
time, keeping a removal only while the three ordinary solving rules — the signs, the
no-three-in-a-row rule, and the balance rule — can still finish the grid unaided. So no
puzzle ever needs a guess, and because that deduction is deterministic, it also proves
the solution unique.

**Zip** shuffles a random Hamiltonian path using backbite moves, then adds numbered stops
until that path is the only route through, and finally takes back every stop that turned
out to be redundant. The solver that verifies this prunes on parity (the path alternates
grid colours, so the remaining counts are forced), connectivity, and degree — together
about 12× faster than the naive search, which is what makes the larger boards practical.

Generation is fast enough to feel instant: typically under 30ms, up to ~1.5s on the
biggest boards, with a spinner while it works.

## Repo layout

```
index.html   the game — open it in a browser, or serve it anywhere static
src/engine.js the three generators and solvers, no DOM
test/engine.test.js  correctness and timing checks
build.py     inlines src/engine.js into index.html
```

`index.html` is committed in built form so it works straight from disk. To change the
puzzle logic, edit `src/engine.js`, then:

```bash
python3 build.py          # inline the engine into index.html
node test/engine.test.js  # verify generation, uniqueness and speed
```

The tests generate hundreds of puzzles per size and check every one: unique solution,
contiguous regions, rules satisfied, path valid. Tango is additionally checked against an
independent brute-force solver that shares no deduction logic with the generator.

## Licence

MIT — see [LICENSE](LICENSE).
