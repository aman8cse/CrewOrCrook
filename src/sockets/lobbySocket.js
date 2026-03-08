import { getRoomByCode, addPlayerToRoom } from "../services/roomService.js";
import Player from "../models/playerModel.js";
import User from "../models/userModel.js";
import Room from "../models/roomModel.js";
import { assignImposter } from "../utils/assignImposter.js";
import { initGameState } from "../services/gameStateService.js";
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

        //saving roomCode in socket for future use, in-case roomCode is not in event payload
        socket.data.roomCode = roomCode;

        player = await addPlayerToRoom({
          room,
          userId,
          socketId: socket.id,
        });
      }

      socket.join(roomCode);

      // Fetch the username to include in the broadcast
      const userDoc = await User.findById(userId).select("username").lean();
      const username = userDoc?.username ?? null;

      socket.to(roomCode).emit("lobby:player-joined", {
        userId,
        playerId: player._id,
        username,
      });

      console.log(
        `User ${userId} (${username}) joined lobby ${roomCode} via socket ${socket.id}`
      );

      // ── Auto-start when room is full ──────────────────────────
      const freshRoom = await Room.findById(room._id);
      if (freshRoom.players.length >= freshRoom.maxPlayers) {
        console.log(`Room ${roomCode} is full — auto-starting game`);

        try {
          await assignImposter(room._id);

          freshRoom.state = GAME_STATE.STARTED;
          await freshRoom.save();

          const players = await Player.find({ roomId: room._id });
          await initGameState(roomCode, players);

          // Notify everyone the game started
          io.to(roomCode).emit("game:started");

          // Send each player their private role
          for (const p of players) {
            if (p.socketId) {
              io.to(p.socketId).emit("game:role", { role: p.role });
            }
          }
        } catch (err) {
          console.error("Auto-start error:", err.message);
          io.to(roomCode).emit("game:error", { message: "Failed to auto-start game" });
        }
      }

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
