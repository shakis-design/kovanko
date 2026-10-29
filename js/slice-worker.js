// Срезы КТ: пересечения треугольников с плоскостями z = const. Считается в воркере, главный поток свободен.
onmessage = ({ data: { id, pos, idx, step } }) => {
  const out = [], ix = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    ix[0] = idx[t] * 3; ix[1] = idx[t + 1] * 3; ix[2] = idx[t + 2] * 3;
    const za = pos[ix[0] + 2], zb = pos[ix[1] + 2], zc = pos[ix[2] + 2], zmax = Math.max(za, zb, zc);
    for (let k = Math.ceil(Math.min(za, zb, zc) / step); k * step <= zmax; k++) {
      const z = k * step, pts = [];
      for (let e = 0; e < 3; e++) {
        const p = ix[e], q = ix[(e + 1) % 3], pz = pos[p + 2], qz = pos[q + 2];
        if ((pz - z) * (qz - z) < 0) { const u = (z - pz) / (qz - pz); pts.push(pos[p] + (pos[q] - pos[p]) * u, pos[p + 1] + (pos[q + 1] - pos[p + 1]) * u); }
      }
      if (pts.length === 4) out.push(pts[0], pts[1], z, pts[2], pts[3], z);
    }
  }
  const a = new Float32Array(out);
  postMessage({ id, out: a }, [a.buffer]);
};
