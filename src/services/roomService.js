import Room from "../models/roomModel.js";
import Player from "../models/playerModel.js";
import generateRoomCode from "../utils/helper.js";
import { assignImposter } from "../utils/assignImposter.js";
import { PLAYER_ROLE, GAME_STATE } from '../constants.js';

//creating new room
export async function createRoom(hostUserId) {
  // Generate a unique room code (retry on collision)
  let code;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
    if (attempts > 10) throw new Error("Failed to generate unique room code");
  } while (await Room.exists({ code }));

  const room = await Room.create({
    code,
    host: hostUserId,
  });
  return room;
}


// get room by code (no populate — players array of ObjectIds is sufficient for length checks)
export async function getRoomByCode(code) {
  return Room.findOne({ code });
}


// get all rooms in lobby state that are not full
export async function getAvailableRooms() {
  return Room.find({ state: GAME_STATE.LOBBY })
    .where("$expr")
    .equals({ $lt: [{ $size: "$players" }, "$maxPlayers"] })
    .select("code host players maxPlayers createdAt")
    .populate("host", "username")
    .lean();
}


//join player
export async function addPlayerToRoom({ room, userId, socketId, role = PLAYER_ROLE.CREWMATE }) {
  const player = await Player.create({
    roomId: room._id,
    userId,
    socketId,
    role,
  });

  await Room.findByIdAndUpdate(room._id, {
    $addToSet: { players: player._id },
  });

  return player;
}

