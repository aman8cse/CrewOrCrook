/**
 * Quick smoke test for the Haversine distance utility.
 * Run: node src/utils/locationUtils.test.js
 */

import { haversineDistance, isWithinRange } from "./locationUtils.js";

let passed = 0;
let failed = 0;

function assert(label, actual, expected, tolerance = 0.5) {
  if (typeof expected === "boolean") {
    if (actual === expected) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}  — expected ${expected}, got ${actual}`);
      failed++;
    }
  } else {
    if (Math.abs(actual - expected) <= tolerance) {
      console.log(`  ✅ ${label}  (${actual.toFixed(2)}m)`);
      passed++;
    } else {
      console.log(`  ❌ ${label}  — expected ~${expected}m, got ${actual.toFixed(2)}m`);
      failed++;
    }
  }
}

console.log("\n=== Haversine Distance Tests ===\n");

// Test 1: Same point → 0m
const p1 = { lat: 28.6139, lng: 77.2090 };
assert("Same point = 0m", haversineDistance(p1, p1), 0);

// Test 2: ~7.5m apart (tiny longitude shift at Delhi's latitude)
// At lat ~28.6, 1 degree of longitude ≈ 97,304m
// So for ~7.5m: delta_lng ≈ 7.5 / 97304 ≈ 0.0000771
const p2 = { lat: 28.6139, lng: 77.2090 };
const p3 = { lat: 28.6139, lng: 77.2090 + 0.0000771 };
const dist8m = haversineDistance(p2, p3);
assert("~7.5m apart", dist8m, 7.5, 1);

// Test 3: Should be within 8m range
assert("Within 8m range", isWithinRange(p2, p3, 8), true);

// Test 4: ~50m apart → should NOT be within 8m
const p4 = { lat: 28.6139, lng: 77.2090 };
const p5 = { lat: 28.6139, lng: 77.2095 }; // ~50m
assert("50m apart NOT within 8m", isWithinRange(p4, p5, 8), false);

// Test 5: Known distance — Eiffel Tower to Arc de Triomphe ≈ 2830m
const eiffel = { lat: 48.8584, lng: 2.2945 };
const arc = { lat: 48.8738, lng: 2.2950 };
assert("Eiffel→Arc de Triomphe ~1712m", haversineDistance(eiffel, arc), 1712, 50);

// Test 6: Large distance — Delhi to Mumbai ≈ ~1,140 km
const delhi = { lat: 28.6139, lng: 77.2090 };
const mumbai = { lat: 19.0760, lng: 72.8777 };
const delhiMumbai = haversineDistance(delhi, mumbai);
assert("Delhi→Mumbai ~1140km", delhiMumbai, 1_140_000, 20_000);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
