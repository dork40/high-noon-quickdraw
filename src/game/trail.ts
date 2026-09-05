export type TrailPoint = { x: number; y: number };

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export function createTrail(seed: number, count = 34): TrailPoint[] {
  const random = seededRandom(seed);
  const points: TrailPoint[] = [{ x: .07, y: .5 }];
  let y = .5;
  for (let index = 1; index < count; index++) {
    y = Math.max(.13, Math.min(.87, y + (random() - .5) * .3));
    points.push({ x: .07 + index * .86 / (count - 1), y });
  }
  return points;
}

export function scoreTrail(points: TrailPoint[], trail: TrailPoint[]) {
  if (!points.length) return { score: 0, progress: 0, accuracy: 0 };
  let reached = 0;
  for (const point of points) {
    let nearestIndex = 0;
    let nearest = Infinity;
    trail.forEach((target, index) => {
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance < nearest) { nearest = distance; nearestIndex = index; }
    });
    reached = Math.max(reached, nearestIndex);
  }
  const progress = Math.round(reached / (trail.length - 1) * 100);
  // Compare the reached target section against the player's whole trace so a single start/end jump cannot earn full accuracy.
  const totalDistance = trail.slice(0, reached + 1).reduce((total, target) => total + Math.min(...points.map(point => Math.hypot(point.x - target.x, point.y - target.y))), 0);
  const accuracy = Math.round(Math.max(0, 1 - totalDistance / (reached + 1) / .16) * 100);
  return { score: Math.round(progress * .6 + accuracy * .4 + (progress > 92 ? 8 : 0)), progress, accuracy };
}

export function aiTrailScore(difficulty: "easy" | "normal" | "hard") {
  const ranges = { easy: [48, 72], normal: [68, 88], hard: [84, 98] } as const;
  const [minimum, maximum] = ranges[difficulty];
  return Math.round(minimum + Math.random() * (maximum - minimum));
}
