'use strict';
const E = require('../src/engine.js');

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; if (failures < 25) console.log('  FAIL: ' + msg); } };

/* Independent verifier for Tango uniqueness: plain row-major search that checks
   the published rules directly, with no deduction shared with the generator. */
function bruteTangoCount(n, givens, edges, limit) {
  const total = n * n, half = n / 2;
  const g = new Array(total).fill(-1);   // filled strictly in row-major order, givens included
  const incident = Array.from({ length: total }, () => []);
  for (const e of edges) { incident[e.a].push([e.b, e.type]); incident[e.b].push([e.a, e.type]); }
  let count = 0;

  const allowed = (i, v) => {
    const r = (i / n) | 0, c = i % n;
    let rowSame = 0, colSame = 0;
    for (let k = 0; k < n; k++) {
      if (g[r * n + k] === v) rowSame++;
      if (g[k * n + c] === v) colSame++;
    }
    if (rowSame >= half || colSame >= half) return false;
    if (c >= 2 && g[i - 1] === v && g[i - 2] === v) return false;
    if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) return false;
    for (const [j, type] of incident[i]) {
      if (g[j] === -1) continue;
      if (type === '=' ? g[j] !== v : g[j] === v) return false;
    }
    return true;
  };

  function walk(i) {
    if (count >= limit) return;
    if (i === total) { count++; return; }
    const choices = givens[i] !== -1 ? [givens[i]] : [0, 1];
    for (const v of choices) {
      if (!allowed(i, v)) continue;
      g[i] = v;
      walk(i + 1);
      g[i] = -1;
    }
  }
  walk(0);
  return count;
}

function regionsContiguous(n, region) {
  for (let g = 0; g < n; g++) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (region[i] === g) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop(), r = (i / n) | 0, c = i % n, nb = [];
      if (r > 0) nb.push(i - n); if (r < n - 1) nb.push(i + n);
      if (c > 0) nb.push(i - 1); if (c < n - 1) nb.push(i + 1);
      for (const k of nb) if (region[k] === g && !seen.has(k)) { seen.add(k); stack.push(k); }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

console.log('--- QUEENS ---');
for (const n of [5, 6, 7, 8, 9]) {
  const t0 = Date.now();
  let worst = 0, mn = 99, mx = 0, made = 0;
  for (let k = 0; k < 25; k++) {
    const s = Date.now();
    const p = E.generateQueens(n);
    worst = Math.max(worst, Date.now() - s);
    check(!!p, `n=${n} generated`);
    if (!p) continue;
    made++;
    check(E.countQueensSolutions(n, p.region, 3) === 1, `n=${n} unique`);
    check(regionsContiguous(n, p.region), `n=${n} regions contiguous`);
    const cols = new Set(), regs = new Set();
    for (let r = 0; r < n; r++) {
      const c = p.solution[r];
      cols.add(c); regs.add(p.region[r * n + c]);
      if (r > 0) check(Math.abs(p.solution[r - 1] - c) > 1, `n=${n} queens not touching`);
    }
    check(cols.size === n && regs.size === n, `n=${n} one queen per column and region`);
    const sizes = E.regionSizes(n, p.region);
    mn = Math.min(mn, ...sizes); mx = Math.max(mx, ...sizes);
  }
  console.log(`n=${n}: ${made}/25 in ${Date.now() - t0}ms (worst ${worst}ms), region sizes ${mn}..${mx} (avg ${n})`);
}

console.log('--- TANGO ---');
for (const n of [6, 8]) {
  for (const keep of [6, 3, 0]) {
    const t0 = Date.now();
    let worst = 0, givens = 0, signs = 0, made = 0;
    for (let k = 0; k < 15; k++) {
      const s = Date.now();
      let p = null, tries = 0;
      while (!p && tries++ < 30) p = E.generateTango(n, keep);
      worst = Math.max(worst, Date.now() - s);
      check(!!p, `n=${n} generated`);
      if (!p) continue;
      made++;
      check(E.tangoSolved(n, E.tangoLogicSolve(n, p.givens, p.edges)), `n=${n} solvable by rules alone`);
      if (n === 6) check(bruteTangoCount(n, p.givens, p.edges, 2) === 1, `n=${n} unique (brute force)`);
      const logic = E.tangoLogicSolve(n, p.givens, p.edges);
      for (let i = 0; i < n * n; i++) check(logic[i] === p.solution[i], 'logic solve matches solution');
      for (const e of p.edges) check((p.solution[e.a] === p.solution[e.b]) === (e.type === '='), 'sign matches solution');
      for (let r = 0; r < n; r++) {
        let cnt = 0;
        for (let c = 0; c < n; c++) cnt += p.solution[r * n + c];
        check(cnt === n / 2, 'row balanced');
      }
      givens += p.givens.filter(v => v !== -1).length;
      signs += p.edges.length;
    }
    console.log(`n=${n} extras=${keep}: ${made}/15 in ${Date.now() - t0}ms (worst ${worst}ms), avg ${(givens / made).toFixed(1)} givens + ${(signs / made).toFixed(1)} signs`);
  }
}

console.log('--- ZIP ---');
for (const [w, h] of [[5, 5], [6, 6], [7, 7], [8, 8]]) {
  const t0 = Date.now();
  let worst = 0, checkpoints = 0, made = 0;
  for (let k = 0; k < 10; k++) {
    const s = Date.now();
    const p = E.generateZip(w, h);
    worst = Math.max(worst, Date.now() - s);
    check(!!p, `${w}x${h} generated`);
    if (!p) continue;
    made++;
    const res = E.zipCountSolutions(w, h, p.numbers, 3, 5e6);
    check(!res.timeout && res.count === 1, `${w}x${h} unique (count=${res.count})`);
    check(new Set(p.path).size === w * h, 'path covers every cell once');
    for (let i = 1; i < p.path.length; i++) {
      const a = p.path[i - 1], b = p.path[i];
      check(Math.abs(((a / w) | 0) - ((b / w) | 0)) + Math.abs((a % w) - (b % w)) === 1, 'orthogonal steps');
    }
    let expect = 1;
    for (const cell of p.path) if (p.numbers[cell] > 0) { check(p.numbers[cell] === expect, 'numbers in path order'); expect++; }
    check(p.numbers[p.path[0]] === 1, 'path starts on 1');
    check(p.numbers[p.path[p.path.length - 1]] === expect - 1, 'path ends on the last number');
    checkpoints += p.numbers.filter(v => v > 0).length;
  }
  console.log(`${w}x${h}: ${made}/10 in ${Date.now() - t0}ms (worst ${worst}ms), avg ${(checkpoints / made).toFixed(1)} numbers`);
}

console.log('--- HINTS: QUEENS ---');
for (const n of [6, 8]) {
  let boards = 0, steps = 0, reveals = 0, worstReveals = 0, solvedByLogic = 0;
  for (let k = 0; k < 20; k++) {
    const p = E.generateQueens(n);
    if (!p) continue;
    boards++;
    const marks = new Array(n * n).fill(0);
    const solutionCells = new Set(p.solution.map((c, r) => r * n + c));
    // nothing is ruled out on an untouched board, so the opening hint must be a
    // step the player can verify — an elimination, not a crown out of nowhere
    const opening = E.queensHint(n, p.region, marks, p.solution);
    check(opening.kind === 'dot', `n=${n} opening hint is a verifiable elimination, got ${opening.kind}`);
    let used = 0, revealed = 0, guard = 0;
    while (guard++ < n * n * 4) {
      const crowns = marks.reduce((acc, m) => acc + (m === 2 ? 1 : 0), 0);
      if (crowns === n) break;
      const hint = E.queensHint(n, p.region, marks, p.solution);
      check(!!hint, `n=${n} hint offered while unsolved`);
      if (!hint) break;
      check(typeof hint.text === 'string' && hint.text.length > 12, 'hint carries an explanation');
      check(hint.cell >= 0 && hint.cell < n * n, 'hint points at a real square');
      check(hint.because.every(i => i >= 0 && i < n * n), 'evidence squares are real');
      // the whole point: a hint must never rule out a square the solution needs
      if (hint.kind === 'dot') check(!solutionCells.has(hint.cell), `n=${n} dot hint never lands on a solution square`);
      if (hint.kind === 'crown') check(solutionCells.has(hint.cell), `n=${n} crown hint always lands on a solution square`);
      if (hint.kind === 'mistake') check(false, 'no mistake reported on a clean board');
      if (hint.kind === 'reveal') revealed++;
      marks[hint.cell] = hint.kind === 'dot' ? 1 : 2;
      used++;
    }
    const crowns = marks.reduce((acc, m) => acc + (m === 2 ? 1 : 0), 0);
    check(crowns === n, `n=${n} hints alone finish the board`);
    for (const cell of solutionCells) check(marks[cell] === 2, 'every solution square ends crowned');
    steps += used; reveals += revealed; worstReveals = Math.max(worstReveals, revealed);
    if (!revealed) solvedByLogic++;
  }
  console.log(`n=${n}: ${boards} boards, avg ${(steps / boards).toFixed(1)} hints to finish, ` +
    `${solvedByLogic}/${boards} needed no outright reveal (avg ${(reveals / boards).toFixed(2)}, worst ${worstReveals})`);
}

// a wrong crown must be called out before anything else
{
  const n = 7, p = E.generateQueens(n);
  const marks = new Array(n * n).fill(0);
  const wrongRow = 0;
  let wrongCol = (p.solution[wrongRow] + 2) % n;
  marks[wrongRow * n + wrongCol] = 2;
  const hint = E.queensHint(n, p.region, marks, p.solution);
  check(hint.kind === 'mistake' && hint.cell === wrongRow * n + wrongCol, 'wrong crown is reported as a mistake');
  // two crowns in one row
  const marks2 = new Array(n * n).fill(0);
  marks2[0] = 2; marks2[3] = 2;
  const hint2 = E.queensHint(n, p.region, marks2, p.solution);
  check(hint2.kind === 'mistake' && /row 1/.test(hint2.text), 'clashing crowns explain the clash: ' + hint2.text);
}

{
  const n = 6, p = E.generateQueens(n);
  const marks = new Array(n * n).fill(0);
  marks[0 * n + p.solution[0]] = 1;                 // dot on a square the answer needs
  const hint = E.queensHint(n, p.region, marks, p.solution);
  check(hint.kind === 'mistake' && hint.cell === 0 * n + p.solution[0], 'a dot on a solution square is flagged');
}

console.log('--- HINTS: TANGO ---');
for (const n of [6, 8]) {
  for (const extras of [3, 0]) {
    let boards = 0, steps = 0, reveals = 0, solvedByLogic = 0;
    for (let k = 0; k < 12; k++) {
      let p = null, tries = 0;
      while (!p && tries++ < 30) p = E.generateTango(n, extras);
      if (!p) continue;
      boards++;
      const grid = p.givens.slice();
      let used = 0, revealed = 0, guard = 0;
      while (guard++ < n * n * 4 && grid.some(v => v === -1)) {
        const hint = E.tangoHint(n, grid, p.edges, p.solution);
        check(!!hint, `n=${n} hint offered while unsolved`);
        if (!hint) break;
        check(typeof hint.text === 'string' && hint.text.length > 12, 'hint carries an explanation');
        check(hint.value === p.solution[hint.cell], `n=${n} hint agrees with the solution`);
        check(grid[hint.cell] === -1, 'hint targets an empty square');
        if (/outright/.test(hint.text)) revealed++;
        grid[hint.cell] = hint.value;
        used++;
      }
      check(grid.every((v, i) => v === p.solution[i]), `n=${n} hints alone finish the grid`);
      steps += used; reveals += revealed;
      if (!revealed) solvedByLogic++;
    }
    console.log(`n=${n} extras=${extras}: ${boards} boards, avg ${(steps / boards).toFixed(1)} hints to finish, ` +
      `${solvedByLogic}/${boards} needed no outright reveal`);
  }
}

// a wrong symbol must be called out before anything else
{
  const n = 6;
  let p = null, tries = 0;
  while (!p && tries++ < 30) p = E.generateTango(n, 3);
  const grid = p.givens.slice();
  const empty = grid.findIndex(v => v === -1);
  grid[empty] = 1 - p.solution[empty];
  const hint = E.tangoHint(n, grid, p.edges, p.solution);
  check(hint.kind === 'mistake' && hint.cell === empty, 'wrong symbol is reported as a mistake');
  check(/can't be right/.test(hint.text), 'mistake hint says so plainly');
}

console.log(failures ? `\n${failures} FAILURES` : '\nAll checks passed');
