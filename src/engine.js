'use strict';
/* ============================================================
   Puzzle engines: Zip, Tango, Queens.
   Every generator returns a puzzle with a proven unique solution.
   ============================================================ */

const rnd = n => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
const neighbours = (idx, w, h) => {
  const r = (idx / w) | 0, c = idx % w, out = [];
  if (r > 0) out.push(idx - w);
  if (r < h - 1) out.push(idx + w);
  if (c > 0) out.push(idx - 1);
  if (c < w - 1) out.push(idx + 1);
  return out;
};

/* ==================== QUEENS ====================
   One queen per row, column and colour region; no two queens touching,
   diagonals included. Generation: lay down a valid queen set, grow colour
   regions from those seeds, then repeatedly find a rival solution and move a
   single cell to another region to kill it. */

function queensRandomSolution(n) {
  const cols = [], used = new Array(n).fill(false);
  function place(r) {
    if (r === n) return true;
    for (const c of shuffle([...Array(n).keys()])) {
      if (used[c]) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      used[c] = true; cols.push(c);
      if (place(r + 1)) return true;
      used[c] = false; cols.pop();
    }
    return false;
  }
  return place(0) ? cols : null;
}

function growRegions(n, cols) {
  const total = n * n;
  const region = new Int8Array(total).fill(-1);
  const frontiers = Array.from({ length: n }, () => []);
  const addNbrs = (reg, idx) => {
    for (const k of neighbours(idx, n, n)) if (region[k] === -1) frontiers[reg].push(k);
  };
  for (let i = 0; i < n; i++) region[i * n + cols[i]] = i;
  for (let i = 0; i < n; i++) addNbrs(i, i * n + cols[i]);

  let assigned = n;
  const active = [];
  while (assigned < total) {
    active.length = 0;
    for (let i = 0; i < n; i++) if (frontiers[i].length) active.push(i);
    if (!active.length) return null;
    const reg = active[rnd(active.length)];
    const f = frontiers[reg];
    const pick = rnd(f.length);
    const idx = f[pick];
    f[pick] = f[f.length - 1]; f.pop();
    if (region[idx] !== -1) continue;
    region[idx] = reg; assigned++;
    addNbrs(reg, idx);
  }
  return region;
}

function countQueensSolutions(n, region, limit) {
  const colUsed = new Uint8Array(n), regUsed = new Uint8Array(n);
  let count = 0;
  function walk(r, prev) {
    if (r === n) { count++; return; }
    for (let c = 0; c < n; c++) {
      if (colUsed[c]) continue;
      if (r > 0 && Math.abs(prev - c) <= 1) continue;
      const g = region[r * n + c];
      if (regUsed[g]) continue;
      colUsed[c] = 1; regUsed[g] = 1;
      walk(r + 1, c);
      colUsed[c] = 0; regUsed[g] = 0;
      if (count >= limit) return;
    }
  }
  walk(0, -5);
  return count;
}

// First solution that differs from `avoid`, or null when `avoid` is unique.
function findRivalSolution(n, region, avoid) {
  const colUsed = new Uint8Array(n), regUsed = new Uint8Array(n), cur = new Array(n);
  let found = null;
  function walk(r, prev) {
    if (found) return;
    if (r === n) {
      for (let i = 0; i < n; i++) if (cur[i] !== avoid[i]) { found = cur.slice(); return; }
      return;
    }
    for (let c = 0; c < n; c++) {
      if (colUsed[c]) continue;
      if (r > 0 && Math.abs(prev - c) <= 1) continue;
      const g = region[r * n + c];
      if (regUsed[g]) continue;
      colUsed[c] = 1; regUsed[g] = 1; cur[r] = c;
      walk(r + 1, c);
      colUsed[c] = 0; regUsed[g] = 0;
      if (found) return;
    }
  }
  walk(0, -5);
  return found;
}

function regionStaysConnected(n, region, g, removed) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (region[i] === g && i !== removed) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    for (const k of neighbours(i, n, n)) {
      if (k !== removed && region[k] === g && !seen.has(k)) { seen.add(k); stack.push(k); }
    }
  }
  return seen.size === cells.length;
}

function regionSizes(n, region) {
  const cnt = new Array(n).fill(0);
  for (const g of region) cnt[g]++;
  return cnt;
}

// Move one cell of the rival solution into a neighbouring region: the rival then
// has two queens in that region and none in the old one, so it dies. The real
// solution is untouched because seed cells never move.
function killRival(n, region, sol, rival) {
  const cnt = regionSizes(n, region);
  for (const r of shuffle([...Array(n).keys()]).filter(r => rival[r] !== sol[r])) {
    const idx = r * n + rival[r];
    const g = region[idx];
    if (cnt[g] <= 1) continue;
    const targets = [...new Set(neighbours(idx, n, n).map(k => region[k]))].filter(x => x !== g);
    if (!targets.length) continue;
    if (!regionStaysConnected(n, region, g, idx)) continue;
    targets.sort((a, b) => cnt[a] - cnt[b]);   // hand the cell to the smallest neighbour
    region[idx] = targets[0];
    return true;
  }
  return false;
}

// Cosmetic pass: even the regions out — feed the runts, shave the giants —
// keeping the solution unique. Queen cells never move: that would strand a
// region without its queen.
function rebalanceRegions(n, region, solution, budget) {
  const seeds = new Set(solution.map((c, r) => r * n + c));
  const avg = n;
  const minSize = Math.max(2, Math.round(avg / 2.5));

  // Hand cell `idx` to region `target`, unless that spoils the puzzle.
  const tryMove = (idx, target) => {
    const from = region[idx];
    if (seeds.has(idx) || from === target) return false;
    if (!regionStaysConnected(n, region, from, idx)) return false;
    region[idx] = target;
    if (countQueensSolutions(n, region, 2) === 1) return true;
    region[idx] = from;
    return false;
  };

  for (let tries = 0; tries < budget; tries++) {
    const cnt = regionSizes(n, region);
    let big = 0, small = 0;
    for (let g = 1; g < n; g++) {
      if (cnt[g] > cnt[big]) big = g;
      if (cnt[g] < cnt[small]) small = g;
    }
    const growRunt = cnt[small] < minSize;
    if (!growRunt && cnt[big] <= avg * 1.7) return;

    const moves = [];
    if (growRunt) {                       // pull a neighbour into the runt region
      for (let i = 0; i < n * n; i++) {
        if (region[i] !== small) continue;
        for (const k of neighbours(i, n, n)) {
          if (region[k] !== small && cnt[region[k]] > minSize && !seeds.has(k)) moves.push([k, small]);
        }
      }
    } else {                              // push a border cell out of the giant region
      for (let i = 0; i < n * n; i++) {
        if (region[i] !== big || seeds.has(i)) continue;
        for (const k of neighbours(i, n, n)) {
          if (region[k] !== big && cnt[region[k]] < cnt[big] - 1) moves.push([i, region[k]]);
        }
      }
    }
    if (!moves.length) return;
    const [idx, target] = moves[rnd(moves.length)];
    tryMove(idx, target);
  }
}

function buildQueensBoard(n) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const cols = queensRandomSolution(n);
    if (!cols) return null;
    const region = growRegions(n, cols);
    if (!region) continue;
    for (let iter = 0; iter < 5000; iter++) {
      const rival = findRivalSolution(n, region, cols);
      if (!rival) {
        rebalanceRegions(n, region, cols, 150);
        return { n, region: Array.from(region), solution: cols.slice() };
      }
      if (!killRival(n, region, cols, rival)) break;   // stuck: start over
    }
  }
  return null;
}

function generateQueens(n) {
  // A one-cell region hands the player a queen for free, so prefer a board
  // without one — but take what we can get rather than spinning forever.
  let fallback = null;
  for (let round = 0; round < 6; round++) {
    const board = buildQueensBoard(n);
    if (!board) continue;
    const sizes = regionSizes(n, board.region);
    if (Math.min(...sizes) >= 2 && Math.max(...sizes) <= n * 2.2) return board;
    fallback = fallback || board;
  }
  return fallback;
}

/* ==================== TANGO ====================
   n x n grid of two symbols; n/2 of each per row and column; never three
   alike in a row; '=' / 'x' signs between neighbours. Clues are pared back
   only as far as the basic solving rules can still crack the grid, so every
   puzzle is solvable without guessing (which also proves it unique). */

function tangoFullGrid(n) {
  const g = new Array(n * n).fill(-1);
  const half = n / 2;
  const rowCount = Array.from({ length: n }, () => [0, 0]);
  const colCount = Array.from({ length: n }, () => [0, 0]);
  function fill(i) {
    if (i === n * n) return true;
    const r = (i / n) | 0, c = i % n;
    for (const v of shuffle([0, 1])) {
      if (rowCount[r][v] >= half || colCount[c][v] >= half) continue;
      if (c >= 2 && g[i - 1] === v && g[i - 2] === v) continue;
      if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) continue;
      g[i] = v; rowCount[r][v]++; colCount[c][v]++;
      if (fill(i + 1)) return true;
      g[i] = -1; rowCount[r][v]--; colCount[c][v]--;
    }
    return false;
  }
  return fill(0) ? g : null;
}

// Deterministic solver using the three rules a player actually uses.
// Returns the grid it managed to fill, or null on contradiction.
function tangoLogicSolve(n, givens, edges) {
  const half = n / 2;
  const g = givens.slice();
  const inc = Array.from({ length: n * n }, () => []);
  for (const e of edges) {
    inc[e.a].push([e.b, e.type]);
    inc[e.b].push([e.a, e.type]);
  }
  const lines = [];
  for (let r = 0; r < n; r++) lines.push([...Array(n).keys()].map(c => r * n + c));
  for (let c = 0; c < n; c++) lines.push([...Array(n).keys()].map(r => r * n + c));

  let changed = true;
  while (changed) {
    changed = false;
    // 1. signs
    for (let i = 0; i < n * n; i++) {
      if (g[i] === -1) continue;
      for (const [j, type] of inc[i]) {
        const want = type === '=' ? g[i] : 1 - g[i];
        if (g[j] === -1) { g[j] = want; changed = true; }
        else if (g[j] !== want) return null;
      }
    }
    // 2. never three alike
    for (const line of lines) {
      for (let k = 0; k + 2 < n; k++) {
        const cells = [line[k], line[k + 1], line[k + 2]];
        const vals = cells.map(i => g[i]);
        const unknown = vals.filter(v => v === -1).length;
        if (unknown !== 1) {
          if (unknown === 0 && vals[0] === vals[1] && vals[1] === vals[2]) return null;
          continue;
        }
        const known = vals.filter(v => v !== -1);
        if (known[0] !== known[1]) continue;
        const slot = cells[vals.indexOf(-1)];
        g[slot] = 1 - known[0];
        changed = true;
      }
    }
    // 3. half of each per line
    for (const line of lines) {
      for (let v = 0; v < 2; v++) {
        const have = line.filter(i => g[i] === v).length;
        if (have > half) return null;
        if (have !== half) continue;
        for (const i of line) if (g[i] === -1) { g[i] = 1 - v; changed = true; }
      }
    }
  }
  return g;
}

const tangoSolved = (n, grid) => grid !== null && grid.every(v => v !== -1);

// `extraGivens` is the difficulty dial: the puzzle is first pared back to a lean
// set of clues, then that many extra cells are handed back to the player.
function generateTango(n, extraGivens) {
  const solution = tangoFullGrid(n);
  if (!solution) return null;

  let edges = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) edges.push({ a: i, b: i + 1, type: solution[i] === solution[i + 1] ? '=' : 'x' });
      if (r < n - 1) edges.push({ a: i, b: i + n, type: solution[i] === solution[i + n] ? '=' : 'x' });
    }
  }

  const givens = new Array(n * n).fill(-1);
  const seeds = shuffle([...Array(n * n).keys()]).slice(0, 3);
  for (const c of seeds) givens[c] = solution[c];
  if (!tangoSolved(n, tangoLogicSolve(n, givens, edges))) return null;

  // Strip clues while the basic rules still finish the grid unaided.
  const candidates = shuffle([
    ...edges.map(e => ({ kind: 'edge', ref: e })),
    ...seeds.map(c => ({ kind: 'given', ref: c })),
  ]);
  for (const cand of candidates) {
    if (cand.kind === 'edge') {
      const trimmed = edges.filter(e => e !== cand.ref);
      if (tangoSolved(n, tangoLogicSolve(n, givens, trimmed))) edges = trimmed;
    } else {
      const saved = givens[cand.ref];
      givens[cand.ref] = -1;
      if (!tangoSolved(n, tangoLogicSolve(n, givens, edges))) givens[cand.ref] = saved;
    }
  }

  // Extra givens only ever add information, so the puzzle stays no-guess.
  const spare = shuffle([...Array(n * n).keys()].filter(i => givens[i] === -1));
  for (const i of spare.slice(0, extraGivens)) givens[i] = solution[i];

  return { n, givens, edges, solution };
}

/* ==================== ZIP ====================
   One path through every cell, meeting the numbers in order. Generation:
   shuffle a Hamiltonian path with backbite moves, then add numbered stops
   until the path is the only way through. */

function randomHamiltonianPath(w, h) {
  const total = w * h;
  const path = [];
  for (let r = 0; r < h; r++) {
    for (let k = 0; k < w; k++) path.push(r * w + (r % 2 === 0 ? k : w - 1 - k));
  }
  const pos = new Int32Array(total);
  path.forEach((cell, i) => { pos[cell] = i; });

  for (let it = 0; it < total * 300; it++) {
    if (rnd(2) === 0) {                       // work the head half the time
      path.reverse();
      for (let k = 0; k < total; k++) pos[path[k]] = k;
    }
    const options = neighbours(path[total - 1], w, h);
    const cell = options[rnd(options.length)];
    if (cell === path[total - 2]) continue;
    const i = pos[cell];
    for (let a = i + 1, b = total - 1; a < b; a++, b--) {
      const t = path[a]; path[a] = path[b]; path[b] = t;
    }
    for (let k = i + 1; k < total; k++) pos[path[k]] = k;
  }
  return path;
}

function zipCountSolutions(w, h, numbers, limit, budget) {
  const total = w * h;
  let start = -1, end = -1, maxNum = 0;
  for (let i = 0; i < total; i++) {
    if (numbers[i] === 1) start = i;
    if (numbers[i] > maxNum) { maxNum = numbers[i]; end = i; }
  }
  const nbrs = [], colour = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    nbrs.push(neighbours(i, w, h));
    colour[i] = (((i / w) | 0) + (i % w)) & 1;
  }
  const visited = new Uint8Array(total), queue = new Int32Array(total), seen = new Uint8Array(total);
  const unvisitedByColour = [0, 0];
  for (let i = 0; i < total; i++) unvisitedByColour[colour[i]]++;
  let count = 0, nodes = 0, timeout = false;

  const reachesAll = (cur, remaining) => {
    seen.fill(0);
    let head = 0, tail = 0, found = 0;
    for (const nb of nbrs[cur]) if (!visited[nb] && !seen[nb]) { seen[nb] = 1; queue[tail++] = nb; found++; }
    while (head < tail) {
      for (const nb of nbrs[queue[head++]]) {
        if (!visited[nb] && !seen[nb]) { seen[nb] = 1; queue[tail++] = nb; found++; }
      }
    }
    return found === remaining;
  };

  // Every unvisited cell still needs two path neighbours (one if it is the finish).
  const degreesOK = cur => {
    for (let i = 0; i < total; i++) {
      if (visited[i]) continue;
      let d = 0;
      for (const nb of nbrs[i]) if (!visited[nb] || nb === cur) d++;
      if (d < (i === end ? 1 : 2)) return false;
    }
    return true;
  };

  function walk(cur, depth, nextNum) {
    if (++nodes > budget) { timeout = true; return; }
    if (depth === total) { count++; return; }
    const remaining = total - depth;
    const here = colour[cur];
    // the rest of the path alternates colours, so the counts are forced
    if (unvisitedByColour[1 - here] !== Math.ceil(remaining / 2)) return;
    if (unvisitedByColour[here] !== Math.floor(remaining / 2)) return;
    if (colour[end] !== (remaining % 2 === 1 ? 1 - here : here)) return;
    if (!reachesAll(cur, remaining)) return;
    if (!degreesOK(cur)) return;
    for (const nb of nbrs[cur]) {
      if (visited[nb]) continue;
      if (nb === end && depth + 1 !== total) continue;
      const num = numbers[nb];
      if (num > 0 && num !== nextNum) continue;
      visited[nb] = 1; unvisitedByColour[colour[nb]]--;
      walk(nb, depth + 1, num > 0 ? nextNum + 1 : nextNum);
      visited[nb] = 0; unvisitedByColour[colour[nb]]++;
      if (count >= limit || timeout) return;
    }
  }

  visited[start] = 1; unvisitedByColour[colour[start]]--;
  walk(start, 1, 2);
  return { count, timeout };
}

function numbersFromStops(path, stops, total) {
  const numbers = new Array(total).fill(0);
  [...stops].sort((a, b) => a - b).forEach((p, k) => { numbers[path[p]] = k + 1; });
  return numbers;
}

function generateZip(w, h) {
  const total = w * h;
  const budget = 8000000;              // generous: a stalled count costs more than it saves
  const startStops = Math.round(total / 5) + 1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const path = randomHamiltonianPath(w, h);
    const stops = new Set([0, total - 1]);
    while (stops.size < startStops) stops.add(1 + rnd(total - 2));

    // Keep adding stops until the path is forced. Every extra stop constrains
    // the route further, so this always converges; the trim pass below then
    // takes back the ones that turned out to be redundant.
    for (let step = 0; step < total; step++) {
      const res = zipCountSolutions(w, h, numbersFromStops(path, stops, total), 2, budget);
      if (!res.timeout && res.count === 1) {
        for (const p of shuffle([...stops].filter(p => p !== 0 && p !== total - 1))) {
          if (stops.size <= 3) break;
          stops.delete(p);
          const trial = zipCountSolutions(w, h, numbersFromStops(path, stops, total), 2, budget);
          if (trial.timeout || trial.count !== 1) stops.add(p);
        }
        return { w, h, numbers: numbersFromStops(path, stops, total), path: path.slice() };
      }
      if (stops.size >= total - 1) break;
      let tries = 0;
      while (tries++ < 400) {
        const p = 1 + rnd(total - 2);
        if (!stops.has(p)) { stops.add(p); break; }
      }
    }
  }
  return null;
}

/* ==================== REASONED HINTS ====================
   A hint should teach rather than reveal: work out a step the player could
   deduce from what is already on the board, and say what makes it follow.
   Both engines return
     { kind, cell, value?, because, text }
   with `kind` one of 'crown' | 'dot' | 'sun' | 'moon' | 'mistake' | 'reveal',
   and `because` listing the squares that justify the step, so the board can
   show the evidence next to the conclusion. */

const REGION_NAMES = ['red', 'amber', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'grey'];
const spot = (i, n) => `row ${((i / n) | 0) + 1}, column ${(i % n) + 1}`;

/* ---------- Queens ---------- */

const Q_EMPTY = 0, Q_DOT = 1, Q_CROWN = 2;

// Why two crowns cannot both stand, or null if they can.
function queensClash(n, region, a, b) {
  const ar = (a / n) | 0, ac = a % n, br = (b / n) | 0, bc = b % n;
  if (ar === br) return `both sit in row ${ar + 1}`;
  if (ac === bc) return `both sit in column ${ac + 1}`;
  if (region[a] === region[b]) return 'sit in the same colour region';
  if (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1) return 'are touching';
  return null;
}

// Squares still open for a crown given the crowns already placed. Each closed
// square remembers which crown closed it, and why.
function queensOpenSquares(n, region, crowns, names) {
  const open = new Uint8Array(n * n).fill(1);
  const why = new Array(n * n).fill(null);
  const close = (i, text, by) => {
    if (open[i]) { open[i] = 0; why[i] = { text, because: [by], tier: 1 }; }
  };
  for (const c of crowns) {
    const cr = (c / n) | 0, cc = c % n;
    for (let i = 0; i < n * n; i++) {
      if (i === c) continue;
      const r = (i / n) | 0, cl = i % n;
      if (r === cr) close(i, `row ${cr + 1} already has its crown`, c);
      else if (cl === cc) close(i, `column ${cc + 1} already has its crown`, c);
      else if (region[i] === region[c]) close(i, `the ${names[region[c]]} region already has its crown`, c);
      else if (Math.abs(r - cr) <= 1 && Math.abs(cl - cc) <= 1) close(i, 'it touches a crown', c);
    }
    open[c] = 0;
  }
  return { open, why };
}

// Every open square of one region sharing a row (or column) claims that line for
// the region, so nothing else on the line can hold a crown. Also the mirror
// case, where a line's open squares all belong to a single region.
function queensSqueezes(n, region, open, taken, names) {
  const out = [];
  const byRegion = [], byRow = [], byCol = [];
  for (let g = 0; g < n; g++) { byRegion.push([]); byRow.push([]); byCol.push([]); }
  for (let i = 0; i < n * n; i++) {
    if (!open[i]) continue;
    byRegion[region[i]].push(i);
    byRow[(i / n) | 0].push(i);
    byCol[i % n].push(i);
  }
  const axes = [
    { label: 'row', of: i => (i / n) | 0, lines: byRow, seen: taken.row },
    { label: 'column', of: i => i % n, lines: byCol, seen: taken.col },
  ];

  for (let g = 0; g < n; g++) {
    const cells = byRegion[g];
    if (!cells.length || taken.region.has(g)) continue;
    for (const axis of axes) {
      const lines = new Set(cells.map(axis.of));
      if (lines.size !== 1) continue;
      const line = [...lines][0];
      for (const i of axis.lines[line]) {
        if (region[i] === g) continue;
        out.push({ cell: i, because: cells,
          text: `every square still open in the ${names[g]} region lies in ${axis.label} ${line + 1}, so that ${axis.label}'s crown belongs to the ${names[g]} region` });
      }
    }
  }

  for (const axis of axes) {
    for (let line = 0; line < n; line++) {
      const cells = axis.lines[line];
      if (!cells.length || axis.seen.has(line)) continue;
      const regions = new Set(cells.map(i => region[i]));
      if (regions.size !== 1) continue;
      const g = [...regions][0];
      if (taken.region.has(g)) continue;
      for (const i of byRegion[g]) {
        if (axis.of(i) === line) continue;
        out.push({ cell: i, because: cells,
          text: `${axis.label} ${line + 1} can only be filled from the ${names[g]} region, so that region's crown goes there rather than here` });
      }
    }
  }
  return out;
}

// One step of what-if: try a crown on an open square and see whether it strands
// a region, row or column with nowhere left to go.
function queensLookahead(n, region, crowns, open, taken, names) {
  for (let x = 0; x < n * n; x++) {
    if (!open[x]) continue;
    const fresh = queensOpenSquares(n, region, crowns.concat(x), names).open;
    const trial = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) trial[i] = fresh[i] && open[i] ? 1 : 0;
    // carry the squeezes through the trial too, so the what-if sees as far as
    // the player would after following the obvious consequences
    const trialTaken = {
      region: new Set([...taken.region, region[x]]),
      row: new Set([...taken.row, (x / n) | 0]),
      col: new Set([...taken.col, x % n]),
    };
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (const squeeze of queensSqueezes(n, region, trial, trialTaken, names)) {
        if (!trial[squeeze.cell]) continue;
        trial[squeeze.cell] = 0;
        moved = true;
      }
      if (!moved) break;
    }

    const groups = [
      { label: g => `the ${names[g]} region`, of: i => region[i], seen: taken.region, self: region[x] },
      { label: r => `row ${r + 1}`, of: i => (i / n) | 0, seen: taken.row, self: (x / n) | 0 },
      { label: c => `column ${c + 1}`, of: i => i % n, seen: taken.col, self: x % n },
    ];
    for (const group of groups) {
      for (let g = 0; g < n; g++) {
        if (group.seen.has(g) || g === group.self) continue;
        let survives = false;
        const stranded = [];
        for (let i = 0; i < n * n; i++) {
          if (group.of(i) !== g) continue;
          if (trial[i]) { survives = true; break; }
          if (open[i]) stranded.push(i);
        }
        if (survives) continue;
        return { cell: x, because: stranded,
          text: `a crown here would leave ${group.label(g)} with nowhere to go` };
      }
    }
  }
  return null;
}

// Close every square the rules can rule out, feeding each deduction back in so
// later rules build on it. Without this the reasoning forgets what it just
// worked out and stalls soon after the opening. Every closed square keeps the
// reason that closed it, tiered so a hint can offer the plainest one first.
function queensDeduce(n, region, crowns, names) {
  const { open, why } = queensOpenSquares(n, region, crowns, names);
  const taken = { region: new Set(), row: new Set(), col: new Set() };
  for (const c of crowns) {
    taken.region.add(region[c]); taken.row.add((c / n) | 0); taken.col.add(c % n);
  }

  for (let guard = 0; guard < n * n * 2; guard++) {
    let changed = false;
    for (const squeeze of queensSqueezes(n, region, open, taken, names)) {
      if (!open[squeeze.cell]) continue;
      open[squeeze.cell] = 0;
      why[squeeze.cell] = { text: squeeze.text, because: squeeze.because, tier: 2 };
      changed = true;
    }
    if (changed) continue;                      // cheap rules until they run dry
    const strand = queensLookahead(n, region, crowns, open, taken, names);
    if (!strand) break;
    open[strand.cell] = 0;
    why[strand.cell] = { text: strand.text, because: strand.because, tier: 3 };
  }
  return { open, why, taken };
}

function queensHint(n, region, marks, solution, names = REGION_NAMES) {
  const crowns = [];
  for (let i = 0; i < n * n; i++) if (marks[i] === Q_CROWN) crowns.push(i);

  // 1. Two crowns that cannot coexist.
  for (let a = 0; a < crowns.length; a++) {
    for (let b = a + 1; b < crowns.length; b++) {
      const clash = queensClash(n, region, crowns[a], crowns[b]);
      if (clash) {
        return { kind: 'mistake', cell: crowns[b], because: [crowns[a]],
          text: `These two crowns ${clash}, so one of them has to go.` };
      }
    }
  }
  // 2. A crown that breaks no rule yet, but that no solution can live with.
  for (const c of crowns) {
    if (solution[(c / n) | 0] !== c % n) {
      return { kind: 'mistake', cell: c, because: [],
        text: `This crown breaks no rule yet, but the board can't be finished with it here — take it back.` };
    }
  }

  const { open, why, taken } = queensDeduce(n, region, crowns, names);

  // A square the player has ruled out that the answer actually needs.
  for (let i = 0; i < n * n; i++) {
    if (marks[i] === Q_DOT && solution[(i / n) | 0] === i % n) {
      return { kind: 'mistake', cell: i, because: [],
        text: `This dot can't be right — the board can't be finished with this square ruled out.` };
    }
  }

  const buckets = [
    { label: g => `the ${names[g]} region`, key: i => region[i], done: taken.region },
    { label: r => `row ${r + 1}`, key: i => (i / n) | 0, done: taken.row },
    { label: c => `column ${c + 1}`, key: i => i % n, done: taken.col },
  ];
  // Only one square left, counting just the crowns on the board and the dots the
  // player has already made — a step they can check by looking, rather than one
  // resting on deductions they have not seen yet.
  const single = (visible, phrase) => {
    for (const bucket of buckets) {
      const cells = new Array(n).fill(null).map(() => []);
      for (let i = 0; i < n * n; i++) if (visible[i]) cells[bucket.key(i)].push(i);
      for (let g = 0; g < n; g++) {
        if (bucket.done.has(g) || cells[g].length !== 1) continue;
        const cell = cells[g][0];
        const because = [];
        for (let i = 0; i < n * n; i++) {
          if (bucket.key(i) !== g || visible[i] || i === cell) continue;
          if (marks[i] === Q_DOT) because.push(i);            // the player's own dot
          else if (why[i]) because.push(...why[i].because);   // or the crown that rules it out
        }
        return { kind: 'crown', cell, because: [...new Set(because)].slice(0, 10),
          text: phrase(bucket.label(g)) };
      }
    }
    return null;
  };

  // What the player can actually see: crowns they have placed, dots they have
  // made. Deeper deductions belong in an elimination hint that explains itself,
  // not in a crown that appears out of nowhere.
  const fromCrowns = queensOpenSquares(n, region, crowns, names).open;
  const onBoard = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) onBoard[i] = fromCrowns[i] && marks[i] !== Q_DOT ? 1 : 0;
  const plain = single(onBoard, where => `Only one square is left in ${where} — everything else there is crowned out or dotted, so this must be a crown.`);
  if (plain) return plain;

  // Otherwise the plainest square still to rule out.
  for (const tier of [1, 2, 3]) {
    for (let i = 0; i < n * n; i++) {
      if (open[i] || marks[i] !== Q_EMPTY || !why[i] || why[i].tier !== tier) continue;
      return { kind: 'dot', cell: i, because: why[i].because.slice(0, 10),
        text: `A dot here: ${why[i].text}.` };
    }
  }

  // Everything obvious is marked: fall back on the longer chain.
  const chained = single(open, where => `Follow all those dots through and only one square is left in ${where} — it has to be a crown.`);
  if (chained) return chained;

  // 5. Nothing the rules can reach — name a square outright.
  for (let r = 0; r < n; r++) {
    const cell = r * n + solution[r];
    if (marks[cell] !== Q_CROWN) {
      return { kind: 'reveal', cell, because: [],
        text: `No short step from here, so here's one outright: row ${r + 1}'s crown goes at ${spot(cell, n)}.` };
    }
  }
  return null;
}

/* ---------- Tango ---------- */

function tangoHint(n, grid, edges, solution, glyphs = ['sun', 'moon']) {
  const half = n / 2;
  const other = v => glyphs[1 - v];
  const lines = [];
  for (let r = 0; r < n; r++) lines.push({ label: `row ${r + 1}`, cells: [...Array(n).keys()].map(c => r * n + c) });
  for (let c = 0; c < n; c++) lines.push({ label: `column ${c + 1}`, cells: [...Array(n).keys()].map(r => r * n + c) });

  // 1. Anything already wrong outranks any new deduction.
  for (let i = 0; i < n * n; i++) {
    if (grid[i] !== -1 && grid[i] !== solution[i]) {
      return { kind: 'mistake', cell: i, because: [],
        text: `The ${glyphs[grid[i]]} at ${spot(i, n)} can't be right — take it back and the rest will follow.` };
    }
  }

  // 2. A sign next to a filled square settles its neighbour.
  for (const e of edges) {
    for (const [from, to] of [[e.a, e.b], [e.b, e.a]]) {
      if (grid[from] === -1 || grid[to] !== -1) continue;
      const value = e.type === '=' ? grid[from] : 1 - grid[from];
      return { kind: glyphs[value], cell: to, value, because: [from],
        text: `The ${e.type === '=' ? '=' : '×'} sign says these two squares ${e.type === '=' ? 'match' : 'differ'}, and its neighbour is a ${glyphs[grid[from]]} — so this one is a ${glyphs[value]}.` };
    }
  }

  // 3. Never three alike: a pair, or a gap between two of a kind.
  for (const line of lines) {
    for (let k = 0; k + 2 < n; k++) {
      const trio = [line.cells[k], line.cells[k + 1], line.cells[k + 2]];
      const values = trio.map(i => grid[i]);
      if (values.filter(v => v === -1).length !== 1) continue;
      const known = values.filter(v => v !== -1);
      if (known[0] !== known[1]) continue;
      const cell = trio[values.indexOf(-1)];
      const value = 1 - known[0];
      return { kind: glyphs[value], cell, value, because: trio.filter(i => i !== cell),
        text: values.indexOf(-1) === 1
          ? `Two ${glyphs[known[0]]}s in ${line.label} with one gap between them — filling it would make three in a row, so this is a ${other(known[0])}.`
          : `Two ${glyphs[known[0]]}s sit side by side in ${line.label}, so a third here would make three in a row — this is a ${other(known[0])}.` };
    }
  }

  // 4. A line that already holds its share of one symbol.
  for (const line of lines) {
    for (let v = 0; v < 2; v++) {
      const placed = line.cells.filter(i => grid[i] === v);
      if (placed.length !== half) continue;
      const empty = line.cells.find(i => grid[i] === -1);
      if (empty === undefined) continue;
      const label = line.label[0].toUpperCase() + line.label.slice(1);
      return { kind: glyphs[1 - v], cell: empty, value: 1 - v, because: placed,
        text: `${label} already has all ${half} of its ${glyphs[v]}s, so every square left in it is a ${other(v)}.` };
    }
  }

  // 5. Nothing the basic rules can reach — name a square outright.
  for (let i = 0; i < n * n; i++) {
    if (grid[i] === -1) {
      return { kind: glyphs[solution[i]], cell: i, value: solution[i], because: [],
        text: `No short step from here, so here's one outright: ${spot(i, n)} is a ${glyphs[solution[i]]}.` };
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    generateQueens, generateTango, generateZip,
    countQueensSolutions, tangoLogicSolve, tangoSolved, zipCountSolutions, regionSizes,
    randomHamiltonianPath, numbersFromStops,
    queensHint, tangoHint, REGION_NAMES,
  };
}
