"use client";

import type { PlayerEntry } from "@/types/game";

export function LobbyPanel({
  roomCode,
  hostName,
  players,
  hostId,
  currentUserId,
  onStartGame,
  onBack,
  loadingAction,
}: {
  roomCode: string;
  hostName: string;
  players: PlayerEntry[];
  hostId: string | null;
  currentUserId?: string;
  onStartGame: () => void;
  onBack: () => void;
  loadingAction?: string | null;
}) {
  return (
    <section className="card lobby-panel">
      <div className="section-header">
        <h2>Lobby · {roomCode}</h2>
        <span className="status-pill">Host: {hostName}</span>
      </div>

      <div className="lobby-players">
        {players.map((player) => (
          <div key={player.playerId} className={`player-card ${hostId === player.userId ? "active-host" : ""}`}>
            <div className="player-avatar">{(player.username || "?").slice(0, 1).toUpperCase()}</div>
            <strong>{player.username || "Unknown"}</strong>
            <small>{hostId === player.userId ? "Host" : "Crew member"}</small>
            <small>{player.isConnected ? "Online" : "Disconnected"}</small>
          </div>
        ))}
      </div>

      <div className="inline-actions">
        {hostId === currentUserId && (
          <button className="primary-btn" type="button" onClick={onStartGame} disabled={loadingAction === "start-game"}>
            {loadingAction === "start-game" ? "Starting..." : "Start game"}
          </button>
        )}
        <button className="secondary-btn" type="button" onClick={onBack}>Back to rooms</button>
      </div>
    </section>
  );
}
