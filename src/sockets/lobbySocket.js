import { getRoomByCode, addPlayerToRoom } from "../services/roomService.js";
import Player from "../models/playerModel.js";
import { GAME_STATE } from "../constants.js";

export default function lobbySocketHandler(io, socket) {
  console.log("Lobby socket ready:", socket.id);

  // Join lobby — creates player record if needed, sets socketId, joins socket room
  socket.on("lobby:join-room", async ({ roomCode }, callback) => {
    try {
      const userId = socket.user.id;

      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      // If this socket is already in this room, no-op
      if (socket.rooms.has(roomCode)) {
        return callback?.({ ok: true, roomCode, message: "Already in room" });
      }

      const room = await getRoomByCode(roomCode);
      if (!room) {
        return callback?.({ ok: false, message: "Room not found" });
      }

      if (room.state !== GAME_STATE.LOBBY) {
        return callback?.({ ok: false, message: "Game already started" });
      }

      // Check if player already exists in this room
      let player = await Player.findOne({ roomId: room._id, userId });

      if (player) {
        // If the player had an OLD socket, kick it out of the room
        if (player.socketId && player.socketId !== socket.id) {
          const oldSocket = io.sockets.sockets.get(player.socketId);
          if (oldSocket) {
            oldSocket.leave(roomCode);
            console.log(`Removed stale socket ${player.socketId} for user ${userId}`);
          }
        }

        // Re-attach current socket
        player.socketId = socket.id;
        await player.save();
      } else {
        // New player — validate capacity and create record
        if (room.players.length >= room.maxPlayers) {
          return callback?.({ ok: false, message: "Room is full" });
        }

        player = await addPlayerToRoom({
          room,
          userId,
          socketId: socket.id,
        });
      }

      socket.join(roomCode);

      socket.to(roomCode).emit("lobby:player-joined", {
        user: userId,
        playerId: player._id,
      });

      console.log(
        `User ${userId} joined lobby ${roomCode} via socket ${socket.id}`
      );

      callback?.({ ok: true, roomCode, player });
    } catch (err) {
      console.error("lobby:join-room error", err);
      callback?.({ ok: false, message: "Server error" });
    }
  });

  // Handle disconnect for lobby
  socket.on("disconnect", async () => {
    try {
      await Player.findOneAndUpdate(
        { socketId: socket.id },
        { socketId: null }
      );
    } catch (err) {
      console.error("Lobby disconnect cleanup error", err);
    }
  });
}
