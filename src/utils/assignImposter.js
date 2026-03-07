import Player from "../models/playerModel.js";
import Room from "../models/roomModel.js";
import { GAME_CONFIG } from "../constants.js";

export async function assignImposter(roomId) {
  const room = await Room.findById(roomId).populate("players");

  if (!room) {
    throw new Error("Modifying Imposter -> Room not found");
  }

  if (!room.players || room.players.length < GAME_CONFIG.MIN_PLAYERS) {
    throw new Error(`Not enough players to assign imposter (need ${GAME_CONFIG.MIN_PLAYERS})`);
  }

  // pick random player
  const randomIndex = Math.floor(Math.random() * room.players.length);
  const imposterPlayer = room.players[randomIndex];

  // update role
  await Player.findByIdAndUpdate(imposterPlayer._id, {
    role: "imposter",
  });

  return imposterPlayer;
}
