"use client";

import type { RoomRecord } from "@/types/game";

export function DashboardPanel({
  availableRooms,
  roomCodeInput,
  setRoomCodeInput,
  onRefresh,
  onCreateRoom,
  onJoinRoom,
  onLogout,
}: {
  availableRooms: RoomRecord[];
  roomCodeInput: string;
  setRoomCodeInput: (value: string) => void;
  onRefresh: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLogout: () => void;
}) {
  return (
    <section className="dashboard">
      <div className="card dashboard-panel">
        <div className="section-header">
          <h2>Match lobby</h2>
          <button className="ghost-btn" type="button" onClick={onRefresh}>Refresh</button>
        </div>

        <div className="inline-actions" style={{ marginBottom: 18 }}>
          <button className="primary-btn" type="button" onClick={onCreateRoom}>Create room</button>
          <input
            className="input"
            placeholder="Enter room code"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            style={{ maxWidth: 180 }}
          />
          <button className="secondary-btn" type="button" onClick={() => onJoinRoom(roomCodeInput)}>Join room</button>
        </div>

        <div className="room-list">
          {availableRooms.length === 0 ? (
            <div className="room-card">No rooms are currently open. Create one to start a match.</div>
          ) : (
            availableRooms.map((room) => (
              <div className="room-card" key={room.code}>
                <div>
                  <div className="room-code">{room.code}</div>
                  <div className="room-meta">Host: {room.host?.username || "Unknown"} • {room.players?.length || 0}/{room.maxPlayers}</div>
                </div>
                <button className="secondary-btn" type="button" onClick={() => onJoinRoom(room.code)}>Join</button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card dashboard-panel">
        <div className="section-header">
          <h3>Player actions</h3>
        </div>
        <div className="activity-list">
          <button type="button" className="danger-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </section>
  );
}
