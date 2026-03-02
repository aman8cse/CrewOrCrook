import redisClient from "../redis/redisClient.js";
import Room from "../models/roomModel.js";
import { GAME_STATE, PHASE, PLAYER_ROLE, GAME_CONFIG } from "../constants.js";
import { isWithinRange, haversineDistance } from "../utils/locationUtils.js";

const gameKey = (roomCode) => `game:${roomCode}`;

// Safety TTL: auto-expire game state after 2 hours even if cleanup fails
const GAME_STATE_TTL_SECONDS = 2 * 60 * 60;

// ─── Phase helpers ───────────────────────────────────────────────

export async function getPhase(roomCode) {
  const raw = await redisClient.get(gameKey(roomCode));
  if (!raw) throw new Error("Game state not found");
  return JSON.parse(raw).phase;
}

export async function setPhase(roomCode, nextPhase) {
  const raw = await redisClient.get(gameKey(roomCode));
  if (!raw) throw new Error("Game state not found");

  const state = JSON.parse(raw);
  state.phase = nextPhase;

  await saveGameState(roomCode, state);
  return state.phase;
}

// ─── Game state CRUD ─────────────────────────────────────────────

export async function getGameState(roomCode) {
  const raw = await redisClient.get(gameKey(roomCode));
  return raw ? JSON.parse(raw) : null;
}

export async function getGameStateSafe(roomCode) {
  const raw = await redisClient.get(gameKey(roomCode));
  if (!raw) throw new Error("Game state missing");
  return JSON.parse(raw);
}

export async function saveGameState(roomCode, state) {
  await redisClient.set(gameKey(roomCode), JSON.stringify(state), "EX", GAME_STATE_TTL_SECONDS);
}

export async function deleteGameState(roomCode) {
  await redisClient.del(gameKey(roomCode));
}

/**
 * Centralized game-over cleanup: delete Redis state + mark Room as FINISHED.
 * Call this from EVERY code path that emits game:ended.
 */
export async function finishGame(roomCode) {
  await deleteGameState(roomCode);
  await Room.findOneAndUpdate(
    { code: roomCode },
    { state: GAME_STATE.FINISHED }
  );
}

// ─── Timers ──────────────────────────────────────────────────────

export function setTimer(state, type, durationMs) {
  const now = Date.now();
  if (!state.timers) state.timers = {};
  state.timers[type] = now + durationMs;
}

export function isTimerExpired(state, type) {
  if (!state.timers || !state.timers[type]) return false;
  return Date.now() >= state.timers[type];
}

// ─── Init game ───────────────────────────────────────────────────

export async function initGameState(roomCode, players) {
  const state = {
    state: GAME_STATE.STARTED,
    phase: PHASE.FREEPLAY,

    players: {},

    // Dead bodies on the map — cleared after each meeting
    bodies: [],

    tasks: {
      total: 25,
      completed: 0,
      perPlayer: {},
    },

    votes: {},

    timers: {
      meetingEndAt: 0,
      voteEndAt: 0,
    },

    chat: [],

    winner: null,
  };

  for (const p of players) {
    const uid = p.userId.toString();

    state.players[uid] = {
      role: p.role,
      alive: true,
      position: { lat: 0, lng: 0 },

      disconnected: false,
      meetingsLeft: 1,

      cooldowns: {
        killUntil: 0,
        meetingUntil: 0,
      },
    };

    state.tasks.perPlayer[uid] = 0;
  }

  await redisClient.set(gameKey(roomCode), JSON.stringify(state), "EX", GAME_STATE_TTL_SECONDS);

  return state;
}

// ─── Player position ─────────────────────────────────────────────

export async function updatePlayerPosition(roomCode, userId, position) {
  const key = gameKey(roomCode);
  const raw = await redisClient.get(key);
  if (!raw) throw new Error("Game state not found");

  const state = JSON.parse(raw);

  if (state.phase !== PHASE.FREEPLAY) {
    throw new Error("Movement not allowed in current phase");
  }

  const player = state.players[userId];
  if (!player) throw new Error("Player not found in game state");
  if (!player.alive) throw new Error("Dead player cannot move");

  // Validate GPS coordinates
  if (
    position == null ||
    typeof position.lat !== "number" ||
    typeof position.lng !== "number"
  ) {
    throw new Error("Invalid position: must have lat and lng numbers");
  }

  player.position = { lat: position.lat, lng: position.lng };

  await saveGameState(roomCode, state);
  return player;
}

// ─── Nearby targets (for impostor kill button) ───────────────────

/**
 * Returns alive crewmates within KILL_RANGE of the given player,
 * sorted by distance (nearest first).
 * Only meaningful when called for an impostor during freeplay.
 *
 * @returns {{ userId: string, distance: number }[]}
 */
export async function getNearbyTargets(roomCode, impostorId) {
  const state = await getGameStateSafe(roomCode);

  if (state.phase !== PHASE.FREEPLAY) return [];

  const impostor = state.players[impostorId];
  if (!impostor || !impostor.alive) return [];
  if (impostor.role !== PLAYER_ROLE.IMPOSTER) return [];

  // Check cooldown — if on cooldown, no targets available
  const now = Date.now();
  if (impostor.cooldowns.killUntil && now < impostor.cooldowns.killUntil) {
    return [];
  }

  const targets = [];

  for (const [uid, player] of Object.entries(state.players)) {
    if (uid === impostorId) continue;        // skip self
    if (!player.alive) continue;             // skip dead
    if (player.role === PLAYER_ROLE.IMPOSTER) continue; // skip other impostors

    const dist = haversineDistance(impostor.position, player.position);

    if (dist <= GAME_CONFIG.KILL_RANGE_METRES) {
      targets.push({
        userId: uid,
        distance: Math.round(dist * 10) / 10, // 1 decimal place
      });
    }
  }

  // Sort nearest first
  targets.sort((a, b) => a.distance - b.distance);

  return targets;
}

// ─── Kill ────────────────────────────────────────────────────────

export async function killPlayer(roomCode, killerUserId, victimUserId) {
  const key = gameKey(roomCode);
  const raw = await redisClient.get(key);
  if (!raw) throw new Error("Game state not found");

  const state = JSON.parse(raw);

  if (state.phase !== PHASE.FREEPLAY) {
    throw new Error("Kill not allowed in current phase");
  }

  const killer = state.players[killerUserId];
  const victim = state.players[victimUserId];

  if (!killer) throw new Error("Killer not found in game state");
  if (!victim) throw new Error("Victim not found in game state");
  if (!killer.alive) throw new Error("Dead player cannot kill");
  if (killer.role !== PLAYER_ROLE.IMPOSTER) throw new Error("Only imposter can kill");
  if (!victim.alive) throw new Error("Victim already dead");

  // ── Cooldown check ──
  const now = Date.now();
  if (killer.cooldowns.killUntil && now < killer.cooldowns.killUntil) {
    const remaining = Math.ceil((killer.cooldowns.killUntil - now) / 1000);
    throw new Error(`Kill on cooldown, ${remaining}s remaining`);
  }

  // ── Proximity check (8 metres) ──
  if (!isWithinRange(killer.position, victim.position, GAME_CONFIG.KILL_RANGE_METRES)) {
    throw new Error("Target too far — must be within 8 metres");
  }

  // Mark victim dead
  victim.alive = false;

  // Record the body on the map
  state.bodies.push({
    victimId: victimUserId,
    lat: victim.position.lat,
    lng: victim.position.lng,
    killedAt: now,
  });

  // Set kill cooldown (30 seconds)
  killer.cooldowns.killUntil = now + GAME_CONFIG.KILL_COOLDOWN_MS;

  // Check win condition
  const result = evaluateWinCondition(state);

  if (result.ended) {
    state.phase = PHASE.ENDED;
    state.winner = result.winner;
    await saveGameState(roomCode, state);

    return {
      ended: true,
      winner: result.winner,
      victimId: victimUserId,
      position: { lat: victim.position.lat, lng: victim.position.lng },
    };
  }

  await saveGameState(roomCode, state);

  return {
    ended: false,
    victimId: victimUserId,
    position: { lat: victim.position.lat, lng: victim.position.lng },
  };
}

// ─── Bodies ──────────────────────────────────────────────────────

/**
 * Get all dead bodies currently on the map
 */
export async function getBodies(roomCode) {
  const state = await getGameStateSafe(roomCode);
  return state.bodies || [];
}

/**
 * Check if a player is within report range of a specific body
 */
export async function reportBody(roomCode, reporterId, bodyVictimId) {
  const state = await getGameStateSafe(roomCode);

  if (state.phase !== PHASE.FREEPLAY) {
    throw new Error("Reporting not allowed in current phase");
  }

  const reporter = state.players[reporterId];
  if (!reporter) throw new Error("Reporter not found in game state");
  if (!reporter.alive) throw new Error("Dead players cannot report");

  // Find the body
  const body = state.bodies.find((b) => b.victimId === bodyVictimId);
  if (!body) throw new Error("Body not found");

  // Proximity check (8 metres)
  const bodyPos = { lat: body.lat, lng: body.lng };
  if (!isWithinRange(reporter.position, bodyPos, GAME_CONFIG.REPORT_RANGE_METRES)) {
    throw new Error("Too far from body — must be within 8 metres to report");
  }

  // Trigger meeting
  state.phase = PHASE.MEETING;
  setTimer(state, "meetingEndAt", GAME_CONFIG.MEETING_DURATION_MS);

  await saveGameState(roomCode, state);

  return {
    reporterId,
    bodyVictimId,
    bodyPosition: bodyPos,
  };
}

/**
 * Clear all bodies from the map (called after meeting resolves)
 */
function clearBodies(state) {
  state.bodies = [];
}

// ─── Win condition ───────────────────────────────────────────────

export function evaluateWinCondition(state) {
  let aliveCrew = 0;
  let aliveImposters = 0;

  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;

    if (player.role === PLAYER_ROLE.IMPOSTER) {
      aliveImposters++;
    } else {
      aliveCrew++;
    }
  }

  if (aliveImposters === 0) {
    return { ended: true, winner: PLAYER_ROLE.CREWMATE };
  }

  if (aliveImposters >= aliveCrew) {
    return { ended: true, winner: PLAYER_ROLE.IMPOSTER };
  }

  return { ended: false };
}

// ─── Tasks ───────────────────────────────────────────────────────

export async function incrementTask(roomCode, userId) {
  const state = await getGameStateSafe(roomCode);

  if (state.phase !== PHASE.FREEPLAY) {
    throw new Error("Tasks only allowed during freeplay");
  }

  const player = state.players[userId];
  if (!player || !player.alive) {
    throw new Error("Invalid player");
  }

  if (player.role === PLAYER_ROLE.IMPOSTER) {
    throw new Error("Imposters cannot complete tasks");
  }

  state.tasks.completed += 1;
  state.tasks.perPlayer[userId] += 1;

  const done = state.tasks.completed;
  const total = state.tasks.total;

  await saveGameState(roomCode, state);

  return {
    done,
    total,
    winner: done >= total,
  };
}

// ─── Voting ──────────────────────────────────────────────────────

export async function registerVote(roomCode, voterId, targetId) {
  const state = await getGameStateSafe(roomCode);

  if (state.phase !== PHASE.MEETING) {
    throw new Error("Voting not allowed outside meeting");
  }

  if (!state.players[voterId]?.alive) {
    throw new Error("Dead players cannot vote");
  }

  state.votes[voterId] = targetId || "skip";

  await saveGameState(roomCode, state);
  return state.votes;
}

export function haveAllVoted(state) {
  const alivePlayers = Object.entries(state.players)
    .filter(([_, p]) => p.alive)
    .map(([id]) => id);

  return alivePlayers.every((id) => state.votes[id]);
}

export function countVotes(votes) {
  const tally = {};
  for (const target of Object.values(votes)) {
    tally[target] = (tally[target] || 0) + 1;
  }
  return tally;
}

export function getVoteResult(tally) {
  let max = 0;
  let selected = null;
  let tie = false;

  for (const [playerId, count] of Object.entries(tally)) {
    if (count > max) {
      max = count;
      selected = playerId;
      tie = false;
    } else if (count === max) {
      tie = true;
    }
  }

  if (tie || selected === "skip") {
    return { type: "tie" };
  }

  return { type: "eject", playerId: selected };
}

export async function resolveVoting(roomCode) {
  const state = await getGameStateSafe(roomCode);

  const tally = countVotes(state.votes);
  const result = getVoteResult(tally);

  if (result.type === "eject") {
    const player = state.players[result.playerId];
    if (player) player.alive = false;
  }

  // Reset for next round
  state.votes = {};
  state.phase = PHASE.FREEPLAY;

  // Clear bodies and chat after meeting
  clearBodies(state);
  state.chat = [];

  const winCheck = evaluateWinCondition(state);
  if (winCheck.ended) {
    state.phase = PHASE.ENDED;
    state.winner = winCheck.winner;
  }

  await saveGameState(roomCode, state);

  return {
    result,
    winner: state.winner || null,
  };
}

// ─── Meeting Chat ────────────────────────────────────────────────

export async function addMeetingMessage(roomCode, userId, message) {
  const state = await getGameStateSafe(roomCode);

  if (state.phase !== PHASE.MEETING) {
    throw new Error("Chat allowed only during meeting");
  }

  if (!state.players[userId] || !state.players[userId].alive) {
    throw new Error("Only alive players can chat");
  }

  const clean = String(message || "").trim();
  if (!clean) throw new Error("Empty message");
  if (clean.length > 200) throw new Error("Message too long");

  if (!state.chat) state.chat = [];

  const msg = {
    userId,
    message: clean,
    ts: Date.now(),
  };

  state.chat.push(msg);

  // keep last 50 messages only
  if (state.chat.length > 50) {
    state.chat = state.chat.slice(-50);
  }

  await saveGameState(roomCode, state);
  return msg;
}

export async function getMeetingMessages(roomCode) {
  const state = await getGameStateSafe(roomCode);
  return state.chat || [];
}

