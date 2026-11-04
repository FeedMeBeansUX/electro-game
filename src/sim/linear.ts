/**
 * Solves A·x = b in place with Gaussian elimination and partial pivoting.
 * `a` is a row-major n×n matrix. Returns null if the matrix is singular.
 */
export function solveLinear(a: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(a[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r * n + col]);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-300) return null;
    if (pivot !== col) {
      for (let c = 0; c < n; c++) {
        const tmp = a[col * n + c];
        a[col * n + c] = a[pivot * n + c];
        a[pivot * n + c] = tmp;
      }
      const tb = b[col];
      b[col] = b[pivot];
      b[pivot] = tb;
    }
    const d = a[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = a[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) a[r * n + c] -= f * a[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= a[r * n + c] * x[c];
    x[r] = s / a[r * n + r];
  }
  return x;
}
