// Deterministic transcendental maths for the sim (Tech §3.2). JavaScript engines may approximate
// Math.sin/cos/atan2/exp/log/pow differently; IEEE-754 + - × ÷ and sqrt are exact everywhere, so
// these functions use only those (plus Math.round/floor/abs) and give bit-identical results on
// every engine. Accuracy is ~1e-15 relative — far below anything gameplay can notice.

const PI = Math.PI;
const HALF_PI = PI / 2;
// π/2 split for Cody–Waite range reduction: HI has trailing zero bits so k × HI is exact.
const HALF_PI_HI = 1.5707963267341256;
const HALF_PI_LO = 6.077100506506192e-11;
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const LN2 = LN2_HI + LN2_LO;

/** sin(r) for |r| ≤ π/4 (Taylor to r^17). */
function sinKernel(r: number): number {
  const r2 = r * r;
  return (
    r *
    (1 +
      r2 *
        (-1 / 6 +
          r2 *
            (1 / 120 +
              r2 *
                (-1 / 5040 +
                  r2 *
                    (1 / 362880 +
                      r2 *
                        (-1 / 39916800 +
                          r2 *
                            (1 / 6227020800 +
                              r2 * (-1 / 1307674368000 + r2 / 355687428096000))))))))
  );
}

/** cos(r) for |r| ≤ π/4 (Taylor to r^18). */
function cosKernel(r: number): number {
  const r2 = r * r;
  return (
    1 +
    r2 *
      (-1 / 2 +
        r2 *
          (1 / 24 +
            r2 *
              (-1 / 720 +
                r2 *
                  (1 / 40320 +
                    r2 *
                      (-1 / 3628800 +
                        r2 *
                          (1 / 479001600 +
                            r2 *
                              (-1 / 87178291200 +
                                r2 * (1 / 20922789888000 - r2 / 6402373705728000))))))))
  );
}

/** Reduces x to r ∈ [-π/4, π/4] with x = k·π/2 + r; returns [quadrant 0..3, r]. */
function reduceQuarter(x: number): readonly [number, number] {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI_HI - k * HALF_PI_LO;
  const q = ((k % 4) + 4) % 4;
  return [q, r];
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [q, r] = reduceQuarter(x);
  switch (q) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [q, r] = reduceQuarter(x);
  switch (q) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

/** atan for |x| ≤ ~0.2 (Taylor to x^31). */
function atanKernel(x: number): number {
  const x2 = x * x;
  let sum = 0;
  for (let n = 31; n >= 3; n -= 2) {
    const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
    sum = x2 * (sign / n + sum);
  }
  return x * (1 + sum);
}

export function atan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return HALF_PI;
  if (x === -Infinity) return -HALF_PI;
  const negative = x < 0;
  let a = Math.abs(x);
  let offset = 0;
  if (a > 1) {
    a = 1 / a;
    offset = HALF_PI;
  }
  // Two argument halvings: atan(a) = 2·atan(a / (1 + √(1 + a²))). |a| ≤ 1 → ≤ tan(π/16) ≈ 0.199.
  a = a / (1 + Math.sqrt(1 + a * a));
  a = a / (1 + Math.sqrt(1 + a * a));
  let result = 4 * atanKernel(a);
  if (offset !== 0) result = offset - result;
  return negative ? -result : result;
}

export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 0 && y === 0) return 0;
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  const base = atan(y / x);
  if (x > 0) return base;
  return y >= 0 ? base + PI : base - PI;
}

/** 2^k for integer k, by exact binary exponentiation. */
function pow2(k: number): number {
  let result = 1;
  let base = k >= 0 ? 2 : 0.5;
  let n = Math.abs(k);
  while (n > 0) {
    if (n % 2 === 1) result *= base;
    base *= base;
    n = Math.floor(n / 2);
  }
  return result;
}

export function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2_HI - k * LN2_LO; // |r| ≤ ln2/2
  // Taylor to r^16 (Horner).
  let sum = 1;
  for (let n = 16; n >= 1; n--) sum = 1 + (r * sum) / n;
  // Split the scale to avoid overflow/underflow of 2^k on its own near the range ends.
  const half = Math.trunc(k / 2);
  return sum * pow2(half) * pow2(k - half);
}

export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  // x = m · 2^e with m ∈ [√½, √2). Scaling by powers of two is exact.
  let m = x;
  let e = 0;
  while (m >= Math.SQRT2) {
    m /= 2;
    e++;
  }
  while (m < Math.SQRT1_2) {
    m *= 2;
    e--;
  }
  // log(m) = 2·atanh(s), s = (m − 1)/(m + 1), |s| ≤ 0.1716. Series to s^31.
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let sum = 0;
  for (let n = 31; n >= 3; n -= 2) sum = s2 * (1 / n + sum);
  const logM = 2 * s * (1 + sum);
  return e * LN2_HI + (logM + e * LN2_LO);
}

/** x^y. Integer exponents use exact repeated multiplication; others exp(y·log x) for x > 0. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isInteger(y) && Math.abs(y) <= 64) {
    let result = 1;
    let base = y > 0 ? x : 1 / x;
    let n = Math.abs(y);
    while (n > 0) {
      if (n % 2 === 1) result *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    return result;
  }
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN;
  return exp(y * log(x));
}

export function degToRad(deg: number): number {
  return (deg * PI) / 180;
}
