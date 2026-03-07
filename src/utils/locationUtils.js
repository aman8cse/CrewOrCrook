/**
 * GPS / Location utilities for CrewOrCrook
 * Uses the Haversine formula to calculate real-world distance
 * between two {lat, lng} coordinate pairs.
 */

const EARTH_RADIUS_METRES = 6_371_000; // Mean Earth radius in metres

/**
 * Convert degrees to radians
 */
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate distance in metres between two GPS coordinates
 * using the Haversine formula.
 *
 * @param {{ lat: number, lng: number }} pos1
 * @param {{ lat: number, lng: number }} pos2
 * @returns {number} Distance in metres
 */
export function haversineDistance(pos1, pos2) {
  const dLat = toRad(pos2.lat - pos1.lat);
  const dLng = toRad(pos2.lng - pos1.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(pos1.lat)) *
      Math.cos(toRad(pos2.lat)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METRES * c;
}

/**
 * Check if two positions are within a given range (in metres)
 *
 * @param {{ lat: number, lng: number }} pos1
 * @param {{ lat: number, lng: number }} pos2
 * @param {number} rangeMetres
 * @returns {boolean}
 */
export function isWithinRange(pos1, pos2, rangeMetres) {
  return haversineDistance(pos1, pos2) <= rangeMetres;
}
