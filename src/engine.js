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

if (typeof module !== 'undefined') {
  module.exports = {
    generateQueens, generateTango, generateZip,
    countQueensSolutions, tangoLogicSolve, tangoSolved, zipCountSolutions, regionSizes,
    randomHamiltonianPath, numbersFromStops,
  };
}
