// Generate icons/ — the containment chamber: a steel rim, a half-built wall in
// JezzBall's red and blue, a sealed hatched corner, and two particles.
// Run: node tools/make-icons.js  (from the containment folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

function paint(size, pad) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;
  const s = pad ? 0.72 : 1;
  const at = (v) => 50 * u + (v - 50) * u * s;
  const sz = (v) => v * u * s;

  cv.fillRect(0, 0, big, big, "#060a14");
  // Rim and field.
  cv.fillRect(at(10), at(10), sz(80), sz(80), "#2a3d66");
  cv.fillRect(at(14), at(14), sz(72), sz(72), "#0c1426");
  // A sealed region, hatched.
  cv.fillRect(at(14), at(62), sz(72), sz(24), "#12303d");
  for (let x = 14; x < 86; x += 7) cv.fillRect(at(x), at(62), sz(2.5), sz(24), "#1b4a58");
  // The finished wall above it.
  cv.fillRect(at(14), at(58), sz(72), sz(4), "#8aa0cc");
  // The line being built: red half growing left, blue growing right.
  cv.fillRect(at(18), at(36), sz(30), sz(6), "#ff4f6e");
  cv.fillRect(at(48), at(36), sz(26), sz(6), "#47b3ff");
  cv.fillRect(at(17), at(36), sz(3), sz(6), "#ffffff");
  cv.fillRect(at(72), at(36), sz(3), sz(6), "#ffffff");
  // Two particles.
  const ball = (cx, cy, r, edge, mid) => {
    cv.fillCircle(at(cx), at(cy), sz(r), edge);
    cv.fillCircle(at(cx - r * 0.12), at(cy - r * 0.12), sz(r * 0.78), mid);
    cv.fillCircle(at(cx - r * 0.3), at(cy - r * 0.34), sz(r * 0.32), "#ffffff");
  };
  ball(32, 24, 7, "#2f86d6", "#bfe0ff");
  ball(66, 49, 7, "#e2334f", "#ffc3cd");
  return encodePNG(size, size, downsample(cv.px, big, SS));
}

fs.writeFileSync(path.join(OUT, "icon-192.png"), paint(192, false));
fs.writeFileSync(path.join(OUT, "icon-512.png"), paint(512, false));
fs.writeFileSync(path.join(OUT, "maskable-512.png"), paint(512, true));
console.log("icons written to", OUT);
