/**
 * Returns { x, y } percentages around the table perimeter for seating players evenly,
 * with seat 0 (you, once rotated) anchored at the bottom.
 *
 * Uses a superellipse (rounded-rectangle) instead of a plain ellipse so seats hug the
 * table's straighter edges rather than tracing a circle — matches the felt shape in
 * TeenPattiTable.css. Raise SQUARENESS for a more rectangular table, lower it for a rounder one.
 */
const SQUARENESS = 4; // 2 = ellipse, higher = more rectangular

function superellipsePoint(angle, rx, ry, n) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = Math.sign(c) * Math.abs(c) ** (2 / n);
  const y = Math.sign(s) * Math.abs(s) ** (2 / n);
  return { x: x * rx, y: y * ry };
}

export function getSeatPositions(count) {
  const positions = [];
  const rx = 47;
  const ry = 42;
  const startAngle = Math.PI / 2; // start at bottom
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * Math.PI * 2;
    const { x, y } = superellipsePoint(angle, rx, ry, SQUARENESS);
    positions.push({ x: 50 + x, y: 50 + y });
  }
  return positions;
}

/** Rotates the seats array so `viewerIndex` renders first (bottom of the table). */
export function rotateForViewer(seats, viewerIndex) {
  if (viewerIndex < 0) return seats.map((seat, i) => ({ seat, originalIndex: i }));
  const rotated = [];
  for (let i = 0; i < seats.length; i++) {
    const idx = (viewerIndex + i) % seats.length;
    rotated.push({ seat: seats[idx], originalIndex: idx });
  }
  return rotated;
}
