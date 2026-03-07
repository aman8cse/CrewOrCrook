import Room from "../models/roomModel.js";
import Player from "../models/playerModel.js";
import { assignImposter } from "../utils/assignImposter.js";
import { PHASE, GAME_STATE, PLAYER_ROLE, GAME_CONFIG } from "../constants.js";
import {
  setPhase,
  getPhase,
  initGameState,
  updatePlayerPosition,
  killPlayer,
  registerVote,
  resolveVoting,
  getGameStateSafe,
  haveAllVoted,
  addMeetingMessage,
  getMeetingMessages,
  incrementTask,
  reportBody,
  getBodies,
  getNearbyTargets,
  finishGame,
} from "../services/gameStateService.js";


export default function gameSocketHandler(io, socket) {
  console.log("Game socket ready:", socket.id);

  // ─── Player movement (GPS lat/lng) ──────────────────────────────
  socket.on("game:move", async (payload) => {
    try {
      const { roomCode, position } = payload || {};
      const userId = socket.user.id;

      if (!roomCode || !position) {
        return socket.emit("game:error", { message: "roomCode and position {lat, lng} required" });
      }

      if (typeof position.lat !== "number" || typeof position.lng !== "number") {
        return socket.emit("game:error", { message: "position must have lat and lng numbers" });
      }

      await updatePlayerPosition(roomCode, userId, position);

      io.to(roomCode).emit("game:player-moved", {
        userId,
        position,
      });

      // If this player is the impostor, send them their nearby killable targets
      const targets = await getNearbyTargets(roomCode, userId);
      if (targets !== null) {
        // getNearbyTargets returns [] for non-impostors (role check inside),
        // so this only emits meaningful data to the impostor
        socket.emit("game:nearby-targets", { targets });
      }
    } catch (err) {
      console.error("game:move error:", err.message);
      socket.emit("game:error", { event: "game:move", message: err.message });
    }
  });

  // ─── Kill (proximity-checked, cooldown-enforced) ────────────────
  socket.on("game:kill", async (payload) => {
    try {
      const { roomCode, victimId } = payload || {};
      const killerId = socket.user.id;

      if (!roomCode || !victimId) {
        return socket.emit("game:error", { message: "roomCode and victimId required" });
      }

      const result = await killPlayer(roomCode, killerId, victimId);

      // Broadcast kill event with body position to ALL players
      io.to(roomCode).emit("game:kill-event", {
        killerId,
        victimId: result.victimId,
        position: result.position,  // {lat, lng} of the dead body
      });

      if (result.ended) {
        io.to(roomCode).emit("game:ended", {
          winner: result.winner,
        });

        // Cleanup
        await finishGame(roomCode);
      }
    } catch (err) {
      console.error("game:kill error:", err.message);
      socket.emit("game:error", { event: "game:kill", message: err.message });
    }
  });

  // ─── Host starts game ──────────────────────────────────────────
  socket.on("game:start", async ({ roomCode }, callback) => {
    try {
      const userId = socket.user.id;

      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return callback?.({ ok: false, message: "Room not found" });
      }

      if (room.state !== GAME_STATE.LOBBY) {
        return callback?.({ ok: false, message: "Game already started" });
      }

      if (room.host.toString() !== userId) {
        return callback?.({ ok: false, message: "Only host can start the game" });
      }

      const players = await Player.find({ roomId: room._id });
      if (players.length < GAME_CONFIG.MIN_PLAYERS) {
        return callback?.({ ok: false, message: `Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start` });
      }

      await assignImposter(room._id);

      room.state = GAME_STATE.STARTED;
      await room.save();

      const updatedPlayers = await Player.find({ roomId: room._id });
      await initGameState(roomCode, updatedPlayers);

      io.to(roomCode).emit("game:started");

      for (const p of updatedPlayers) {
        if (p.socketId) {
          io.to(p.socketId).emit("game:role", {
            role: p.role,
          });
        }
      }

      callback?.({ ok: true });
    } catch (err) {
      console.error("game:start error", err);
      callback?.({ ok: false, message: "Server error" });
    }
  });

  // ─── Report body (proximity-checked, 8m) ───────────────────────
  socket.on("game:report-body", async ({ roomCode, bodyVictimId }, callback) => {
    try {
      if (!roomCode) return callback?.({ ok: false, message: "roomCode required" });
      if (!bodyVictimId) return callback?.({ ok: false, message: "bodyVictimId required" });

      const reporterId = socket.user.id;

      const result = await reportBody(roomCode, reporterId, bodyVictimId);

      io.to(roomCode).emit("game:meeting-started", {
        reason: "body-reported",
        reporterId: result.reporterId,
        bodyVictimId: result.bodyVictimId,
        bodyPosition: result.bodyPosition,
      });

      callback?.({ ok: true });
    } catch (err) {
      console.error("game:report-body error", err.message);
      callback?.({ ok: false, message: err.message });
    }
  });

  // ─── Emergency meeting ─────────────────────────────────────────
  socket.on("game:emergency-meeting", async ({ roomCode }, callback) => {
    try {
      if (!roomCode) return callback?.({ ok: false, message: "roomCode required" });

      const phase = await getPhase(roomCode);
      if (phase !== PHASE.FREEPLAY) {
        return callback?.({ ok: false, message: "Meeting not allowed now" });
      }

      await setPhase(roomCode, PHASE.MEETING);

      io.to(roomCode).emit("game:meeting-started", {
        reason: "emergency",
        reporterId: socket.user.id,
      });

      callback?.({ ok: true });
    } catch (err) {
      console.error("game:emergency-meeting error", err);
      callback?.({ ok: false, message: "Server error" });
    }
  });

  // ─── Vote ──────────────────────────────────────────────────────
  socket.on("game:vote", async ({ roomCode, targetId }, callback) => {
    try {
      const voterId = socket.user.id;

      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      await registerVote(roomCode, voterId, targetId);

      const state = await getGameStateSafe(roomCode);

      io.to(roomCode).emit("game:vote-update", {
        voterId,
        targetId,
      });

      // Auto resolve if all alive players voted
      if (haveAllVoted(state)) {
        const result = await resolveVoting(roomCode);

        io.to(roomCode).emit("game:vote-result", result);

        if (result.winner) {
          io.to(roomCode).emit("game:ended", {
            winner: result.winner,
          });

          await finishGame(roomCode);
        } else {
          io.to(roomCode).emit("game:freeplay-resumed");
        }
      }

      callback?.({ ok: true });
    } catch (err) {
      console.error("game:vote error", err);
      callback?.({ ok: false, message: err.message });
    }
  });

  // ─── Host force resolve votes ──────────────────────────────────
  socket.on("game:resolve-votes", async ({ roomCode }, callback) => {
    try {
      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      const result = await resolveVoting(roomCode);

      io.to(roomCode).emit("game:vote-result", result);

      if (result.winner) {
        io.to(roomCode).emit("game:ended", {
          winner: result.winner,
        });

        await finishGame(roomCode);
      } else {
        io.to(roomCode).emit("game:freeplay-resumed");
      }

      callback?.({ ok: true });
    } catch (err) {
      console.error("resolve-votes error", err);
      callback?.({ ok: false, message: err.message });
    }
  });

  // ─── Meeting chat ──────────────────────────────────────────────
  socket.on("game:chat", async ({ roomCode, message }, callback) => {
    try {
      const userId = socket.user.id;

      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      if (!socket.rooms.has(roomCode)) {
        return callback?.({ ok: false, message: "Not in this room" });
      }

      const msg = await addMeetingMessage(roomCode, userId, message);

      io.to(roomCode).emit("game:chat-message", msg);

      callback?.({ ok: true });
    } catch (err) {
      console.error("game:chat error", err.message);
      callback?.({ ok: false, message: err.message });
    }
  });

  socket.on("game:chat-history", async ({ roomCode }, callback) => {
    try {
      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      const history = await getMeetingMessages(roomCode);
      callback?.({ ok: true, history });
    } catch (err) {
      console.error("chat-history error", err.message);
      callback?.({ ok: false, message: err.message });
    }
  });

  // ─── Task completion ───────────────────────────────────────────
  socket.on("game:task-complete", async ({ roomCode }, callback) => {
    try {
      const userId = socket.user.id;

      const result = await incrementTask(roomCode, userId);

      io.to(roomCode).emit("game:task-progress", {
        completed: result.done,
        total: result.total,
      });

      if (result.winner) {
        io.to(roomCode).emit("game:ended", {
          winner: PLAYER_ROLE.CREWMATE,
        });

        // Cleanup
        await finishGame(roomCode);
      }

      callback?.({ ok: true });
    } catch (err) {
      console.log(err);
      callback?.({ ok: false, message: err.message });
    }
  });

  // ─── Get dead bodies on map ────────────────────────────────────
  socket.on("game:get-bodies", async ({ roomCode }, callback) => {
    try {
      if (!roomCode) {
        return callback?.({ ok: false, message: "roomCode required" });
      }

      const bodies = await getBodies(roomCode);
      callback?.({ ok: true, bodies });
    } catch (err) {
      console.error("game:get-bodies error", err.message);
      callback?.({ ok: false, message: err.message });
    }
  });

  // ─── Disconnect handling ───────────────────────────────────────
  socket.on("disconnect", async () => {
    console.log("Game socket disconnect:", socket.id);
    try {
      const player = await Player.findOne({ socketId: socket.id });
      if (player) {
        console.log(`Player ${player.userId} disconnected from game`);
      }
    } catch (err) {
      console.error("Game disconnect error:", err.message);
    }
  });
}