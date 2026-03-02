export const GAME_STATE = {
  LOBBY: "lobby",
  STARTED: "started",
  INGAME: "in-game",
  MEETING: "meeting",
  FINISHED: "finished"
};

export const PLAYER_ROLE = {
  CREWMATE: "crewmate",
  IMPOSTER: "imposter"
};

export const PHASE = {
  FREEPLAY: "freeplay",
  MEETING: "meeting",
  ENDED: "ended"
}

export const GAME_CONFIG = {
  MIN_PLAYERS: 3,                 // minimum players to start a game
  KILL_RANGE_METRES: 8,
  REPORT_RANGE_METRES: 8,
  KILL_COOLDOWN_MS: 30_000,       // 30 seconds
  MEETING_DURATION_MS: 120_000,   // 2 minutes
}