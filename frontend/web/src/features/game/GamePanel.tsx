"use client";

import type { ChatMessage, NearbyTarget, PlayerEntry, Position } from "@/types/game";

export function GamePanel({
  role,
  roomCode,
  players,
  currentUserId,
  hostId,
  taskProgress,
  nearbyTargets,
  chat,
  chatDraft,
  setChatDraft,
  onMove,
  onKill,
  onEmergencyMeeting,
  onReportBody,
  onCompleteTask,
  onSendChat,
  onVote,
  voteResult,
  meeting,
  playerPositions,
  bodies,
}: {
  role: string | null;
  roomCode: string;
  players: PlayerEntry[];
  currentUserId?: string;
  hostId: string | null;
  taskProgress: { completed: number; total: number };
  nearbyTargets: NearbyTarget[];
  chat: ChatMessage[];
  chatDraft: string;
  setChatDraft: (value: string) => void;
  onMove: (position: Position) => void;
  onKill: () => void;
  onEmergencyMeeting: () => void;
  onReportBody: () => void;
  onCompleteTask: () => void;
  onSendChat: () => void;
  onVote: (targetId: string) => void;
  voteResult: string | null;
  meeting: boolean;
  playerPositions: Record<string, Position>;
  bodies: Array<{ victimId: string; lat: number; lng: number }>;
}) {
  const relevantPlayers = players.filter((p) => p.userId !== currentUserId && p.isConnected);

  return (
    <section className="card game-panel">
      <div className="section-header">
        <h2>Mission room</h2>
        <span className={`role-badge ${role === "imposter" ? "role-imposter" : "role-crewmate"}`}>
          {role || "Crewmate"}
        </span>
      </div>

      <div className="game-layout">
        <div>
          <div className="map-grid">
            {players.map((player) => {
              const pos = playerPositions[player.userId] || { lat: 28.6139, lng: 77.209 };
              const x = ((pos.lng - 77.2084) / 0.0013) * 100;
              const y = ((28.6147 - pos.lat) / 0.0022) * 100;
              return (
                <div
                  key={player.userId}
                  className="map-player"
                  title={player.username || "Unknown"}
                  style={{
                    left: `${Math.max(8, Math.min(92, x))}%`,
                    top: `${Math.max(8, Math.min(92, y))}%`,
                    background: player.userId === currentUserId ? "#47d8ff" : player.userId === hostId ? "#ffc857" : "#7c5cff",
                  }}
                />
              );
            })}

            {bodies.map((body, index) => (
              <div
                key={`${body.victimId}-${index}`}
                className="map-body"
                style={{
                  left: `${Math.max(8, Math.min(92, ((body.lng - 77.2084) / 0.0013) * 100))}%`,
                  top: `${Math.max(8, Math.min(92, ((28.6147 - body.lat) / 0.0022) * 100))}%`,
                }}
              />
            ))}
          </div>

          <div className="inline-actions" style={{ marginTop: 18, flexWrap: "wrap" }}>
            {[{ lat: 28.6139, lng: 77.209 }, { lat: 28.6141, lng: 77.2091 }, { lat: 28.6138, lng: 77.2095 }, { lat: 28.6132, lng: 77.2092 }].map((pos, index) => (
              <button key={`${pos.lat}-${pos.lng}`} className="ghost-btn" type="button" onClick={() => onMove(pos)}>Move {index + 1}</button>
            ))}
            {role === "imposter" && <button className="danger-btn" type="button" onClick={onKill}>Kill closest target</button>}
            <button className="secondary-btn" type="button" onClick={onEmergencyMeeting}>Emergency meeting</button>
            <button className="secondary-btn" type="button" onClick={onReportBody}>Report body</button>
            <button className="primary-btn" type="button" onClick={onCompleteTask}>Complete task</button>
          </div>
        </div>

        <aside style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="section-header">
              <h3>Mission status</h3>
            </div>
            <p style={{ color: "var(--muted)", marginBottom: 8 }}>Progress: {taskProgress.completed}/{taskProgress.total}</p>
            <div style={{ height: 12, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
              <div
                style={{
                  width: `${(taskProgress.completed / Math.max(taskProgress.total, 1)) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(135deg, var(--accent), var(--success))",
                }}
              />
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="section-header">
              <h3>Nearby targets</h3>
            </div>
            {nearbyTargets.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No valid targets nearby.</p>
            ) : (
              <div className="activity-list">
                {nearbyTargets.map((target) => (
                  <div key={target.userId} className="activity-card">
                    <strong>{target.userId}</strong>
                    <p style={{ color: "var(--muted)", marginTop: 6 }}>{target.distance}m away</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="section-header">
              <h3>Chat</h3>
            </div>
            <div className="chat-box">
              {chat.length === 0 ? <p style={{ color: "var(--muted)" }}>No messages yet.</p> : chat.map((msg, i) => (
                <div className="chat-bubble" key={`${msg.userId}-${msg.ts}-${i}`}>
                  <div className="chat-meta">{msg.userId}</div>
                  <div>{msg.message}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input className="input" value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="Say something..." />
              <button className="primary-btn" type="button" onClick={onSendChat}>Send</button>
            </div>
          </div>
        </aside>
      </div>

      {meeting && (
        <div className="card" style={{ padding: 18 }}>
          <div className="section-header">
            <h3>Meeting</h3>
          </div>
          <div className="inline-actions">
            {relevantPlayers.map((player) => (
              <button key={player.userId} className="secondary-btn" type="button" onClick={() => onVote(player.userId)}>
                Vote {player.username || "Player"}
              </button>
            ))}
          </div>
          {voteResult && <p style={{ marginTop: 12, color: "var(--warning)" }}>{voteResult}</p>}
        </div>
      )}
    </section>
  );
}
