import crypto from "crypto";

// logic for room code generation
// Uses crypto.randomInt() for cryptographically secure randomness
export default function generateRoomCode(length = 6) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}