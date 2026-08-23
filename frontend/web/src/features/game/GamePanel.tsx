"use client";

import React, { useEffect, useRef } from "react";
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
  loadingAction,
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
  loadingAction?: string | null;
}) {
  const relevantPlayers = players.filter((p) => p.userId !== currentUserId && p.isConnected);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markersLayer = useRef<any>(null);
  const isBusy = !!loadingAction;

  const selfPos = playerPositions[currentUserId || ""] || { lat: 28.6139, lng: 77.209 };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mapRef.current) return;
      const L = (await import('leaflet')) as any;
      await import('leaflet/dist/leaflet.css');

      if (!mounted) return;

      if (!mapInstance.current) {
        const map = L.map(mapRef.current).setView([selfPos.lat, selfPos.lng], 17);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);
        mapInstance.current = map;
        markersLayer.current = layer;
      }

      if (mapInstance.current) {
        mapInstance.current.setView([selfPos.lat, selfPos.lng]);
      }

      if (markersLayer.current) {
        markersLayer.current.clearLayers();

        players.forEach((player) => {
          const pos = playerPositions[player.userId] || selfPos;
          const marker = L.marker([pos.lat, pos.lng], { title: player.username || 'Player' });
          marker.bindPopup(`${player.username || 'Player'}`);
          markersLayer.current.addLayer(marker);
        });

        bodies.forEach((b, i) => {
          const m = L.marker([b.lat, b.lng], { title: 'Reported body' });
          m.bindPopup('Reported body');
          markersLayer.current.addLayer(m);
        });
      }
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, playerPositions, bodies, currentUserId]);

  const renderNearby = () => {
    if (!nearbyTargets || nearbyTargets.length === 0) return (<p style={{ color: 'var(--muted)' }}>No valid targets nearby.</p>);
    return (
      <div className="activity-list">
        {nearbyTargets.map((target) => (
          <div key={target.userId} className="activity-card">
            <strong>{target.userId}</strong>
            <p style={{ color: 'var(--muted)', marginTop: 6 }}>{target.distance}m away</p>
          </div>
        ))}
      </div>
    );
  };

  const renderChat = () => {
    if (!chat || chat.length === 0) return (<p style={{ color: 'var(--muted)' }}>No messages yet.</p>);
    return chat.map((msg, i) => (
      <div className="chat-bubble" key={(msg.userId || 'u') + '-' + (msg.ts || i)}>
        <div className="chat-meta">{msg.userId}</div>
        <div>{msg.message}</div>
      </div>
    ));
  };

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
          <div style={{ height: 420, borderRadius: 12, overflow: 'hidden' }}>
            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
          </div>

          <div className="inline-actions" style={{ marginTop: 18, flexWrap: "wrap" }}>
            <button className="ghost-btn" type="button" onClick={() => onMove(selfPos)} disabled={loadingAction === "move" || isBusy}>
              {loadingAction === "move" ? "Updating..." : "Update position"}
            </button>
            {role === "imposter" && (
              <button className="danger-btn" type="button" onClick={onKill} disabled={loadingAction === "kill-target" || isBusy}>
                {loadingAction === "kill-target" ? "Killing..." : "Kill closest target"}
              </button>
            )}
            <button className="secondary-btn" type="button" onClick={onEmergencyMeeting} disabled={loadingAction === "emergency-meeting" || isBusy}>
              {loadingAction === "emergency-meeting" ? "Calling..." : "Emergency meeting"}
            </button>
            <button className="secondary-btn" type="button" onClick={onReportBody} disabled={loadingAction === "report-body" || isBusy}>
              {loadingAction === "report-body" ? "Reporting..." : "Report body"}
            </button>
            <button className="primary-btn" type="button" onClick={onCompleteTask} disabled={loadingAction === "complete-task" || isBusy}>
              {loadingAction === "complete-task" ? "Completing..." : "Complete task"}
            </button>
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
            {renderNearby()}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="section-header">
              <h3>Chat</h3>
            </div>
            <div className="chat-box">{renderChat()}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                className="input"
                value={chatDraft}
                onChange={(e) => setChatDraft((e as any).target.value)}
                placeholder="Say something..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSendChat();
                  }
                }}
              />
              <button className="primary-btn" type="button" onClick={onSendChat} disabled={loadingAction === "chat" || isBusy}>
                {loadingAction === "chat" ? "Sending..." : "Send"}
              </button>
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
              <button
                key={player.userId}
                className="secondary-btn"
                type="button"
                onClick={() => onVote(player.userId)}
                disabled={loadingAction === "vote" || isBusy}
              >
                {loadingAction === "vote" ? "Voting..." : `Vote ${player.username || "Player"}`}
              </button>
            ))}
          </div>
          {voteResult && <p style={{ marginTop: 12, color: "var(--warning)" }}>{voteResult}</p>}
        </div>
      )}
    </section>
  );
}
