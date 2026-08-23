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
  loadingAction,
}: {
  availableRooms: RoomRecord[];
  roomCodeInput: string;
  setRoomCodeInput: (value: string) => void;
  onRefresh: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLogout: () => void;
  loadingAction?: string | null;
}) {
  return (
   <section className="dashboard">
     <div className="card dashboard-panel">
       <div className="section-header">
         <h2>Match lobby</h2>
         <button className="ghost-btn" type="button" onClick={onRefresh} disabled={loadingAction === "refresh"}>
           {loadingAction === "refresh" ? "Loading..." : "Refresh"}
         </button>
       </div>

       <form
         className="inline-actions"
         style={{ marginBottom: 18 }}
         onSubmit={(e) => { e.preventDefault(); onJoinRoom(roomCodeInput); }}
       >
         <button className="primary-btn" type="button" onClick={onCreateRoom} disabled={loadingAction === "create-room"}>
           {loadingAction === "create-room" ? "Creating..." : "Create room"}
         </button>
         <input
           className="input"
           placeholder="Enter room code"
           value={roomCodeInput}
           onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
           style={{ maxWidth: 180 }}
           onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onJoinRoom(roomCodeInput); } }}
         />
         <button className="secondary-btn" type="submit" disabled={loadingAction === "join-room"}>
           {loadingAction === "join-room" ? "Joining..." : "Join room"}
         </button>
       </form>

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
               <button className="secondary-btn" type="button" onClick={() => onJoinRoom(room.code)} disabled={loadingAction === "join-room"}>
                 {loadingAction === "join-room" ? "Joining..." : "Join"}
               </button>
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
         <button type="button" className="danger-btn" onClick={onLogout} disabled={loadingAction === "logout"}>
           {loadingAction === "logout" ? "Logging out..." : "Log out"}
         </button>
       </div>
     </div>
   </section>
  );
}
