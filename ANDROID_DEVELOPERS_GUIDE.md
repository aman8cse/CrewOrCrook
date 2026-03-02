# CrewOrCrook - Android Developer Guide

Welcome to the **CrewOrCrook** documentation! This guide exists to help Android Developers seamlessly integrate with the Express + Socket.IO Node.js backend to build the mobile client for CrewOrCrook (an Among Us style game).

This document covers everything from REST APIs for authentication and room management to detailed real-time Socket.IO game events.

---

## 1. Architecture Overview

- **Backend Stack**: Node.js, Express, MongoDB (Mongoose), Redis (Game state caching & in-memory fast access), and Socket.IO (Real-time updates).
- **Authentication**: JWT-based. You will receive an `accessToken` and `refreshToken` upon login. The `accessToken` is used for both REST API Bearer Auth and Socket handshake auth.
- **State Management**: Redis handles active game state with high frequency reads/writes. Mongo stores persistent user metadata and room setup records.

---

## 2. Authentication Flow

Base URL (REST): `http://<SERVER_IP>:<PORT>`

### REST APIs

Below are the HTTP endpoints necessary before entering a socket session.

#### 1. Register
- **URL**: `POST /auth/register`
- **Body**: `{ "email": "dev1@test.com", "password": "password123", "username": "player1" }`
- **Response** `201 Created`: `{ "user": { ... }, "message": "User registered" }`

#### 2. Login
- **URL**: `POST /auth/login`
- **Body**: `{ "email": "dev1@test.com", "password": "password123" }`
- **Response** `200 OK`: `{ "user": { "id": "...", "username": "..." }, "accessToken": "eyJ..." }`
- **Note**: The endpoint also sets a `refreshToken` in a cookie named `jid`. For Android, you might need a Cookie Manager if you consume the `/reAuth` endpoint, or wait for an update supporting explicit refresh token payload.

#### 3. Setup User Profile (Protected)
- **URL**: `POST /auth/setup`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Body**: Additional user setup parameters based on backend models.
- **Response**: User setup confirmation.

---

## 3. Room Management API (REST)

Before joining via Socket, a player either creates a room or looks up an existing one via REST APIs. **Joining a room is handled entirely through Socket.IO** (see Section 5).

#### 1. Create a Room
- **URL**: `POST /room/createNew`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response** `201 Created`: Returns `room` object including `code` (The 6-char lobby code).

#### 2. Get Available Rooms
- **URL**: `GET /room/available`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response** `200 OK`: Returns an array of rooms that are in LOBBY state and not full. Each room includes `code`, `host` (with `username`), `players` (ObjectId array), `maxPlayers`, and `createdAt`.
- **Use case**: Display a "Browse Rooms" list so players can pick a room to join.

#### 3. Room Lookup
- **URL**: `GET /room/<code>/lookup`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response** `200 OK`: Returns the current `room` state and populated players list.

---

## 4. Socket.IO Connection

Once the user has a room code (from creating or looking up a room), you establish a WebSocket connection to **join the room**.

**Socket.IO URL**: `ws://<SERVER_IP>:<PORT>`

**Important**: 
You MUST pass the JWT token during the initial socket connection handshake.

```kotlin
// Example in Kotlin with Official Socket.IO Android Client
val opts = IO.Options()
opts.auth = mapOf("token" to accessToken)

val socket = IO.socket("http://<SERVER_IP>:<PORT>", opts)
socket.connect()
```

The backend has two logical namespaces divided into event prefixes:
1. `lobby:*` (Events happening in the waiting room before the game starts)
2. `game:*` (Events happening during active gameplay)

---

## 5. Lobby Socket Events (`lobby:*`)

### Emitting to Server

#### `lobby:join-room`
Call this immediately after connecting to the Socket. This is the **unified join mechanism** — it handles both player registration in the database AND attaching your socket to the room's multicast group. No separate REST call is needed.
- **Payload**: `{ "roomCode": "ABCDEF" }`
- **Acknowledgment Callback**: `(response) => { ok: Boolean, message?: String, roomCode?: String, player?: Object }`
- **Errors**: `Room not found`, `Game already started`, `Room is full`

### Listening from Server

#### `lobby:player-joined`
Received when a new player joins the lobby.
- **Payload**: `{ "user": "userId", "playerId": "dbPlayerId" }`

---

## 6. Game Socket Events (`game:*`)

The core game loop relies entirely on real-time sockets. 
**Game Constants Reference**: 
- `KILL_RANGE_METRES`: 8
- `REPORT_RANGE_METRES`: 8
- `KILL_COOLDOWN_MS`: 30,000 (30 seconds)
- `MEETING_DURATION_MS`: 120,000 (2 minutes)

### A. Game Initialization

#### `game:start` (Emitter: HOST Only)
The room host sends this to officially start the game.
- **Payload**: `{ "roomCode": "ABCDEF" }`
- **Ack Callback**: `({ ok: Boolean, message?: String })`

#### `game:started` (Listener: All Players)
Triggered when the host successfully starts the game. Android should transition to the loading/map screen.
- **Payload**: Empty

#### `game:role` (Listener: All Players)
Directly follows `game:started`. Used to assign the identity.
- **Payload**: `{ "role": "crewmate" | "imposter" }`

### B. Movement & Map

#### `game:move` (Emitter: All Alive Players)
Continuously send GPS/Map coordinates to update position.
- **Payload**: `{ "roomCode": "ABCDEF", "position": { "lat": 12.34, "lng": 56.78 } }`

#### `game:player-moved` (Listener: All Players)
Broadband update for rendering other players.
- **Payload**: `{ "userId": "...", "position": { "lat": 12.34, "lng": 56.78 } }`

#### `game:nearby-targets` (Listener: Impostor Only)
The backend calculates proximity based on movement. Impostors receive this list when alive crewmates are inside the `KILL_RANGE_METRES`. Use this to enable/disable the "KILL" shiny red button.
- **Payload**: `{ "targets": [ { "userId": "...", "distance": 4.5 } ] }`

### C. Kill, Bodies, and Reporting

#### `game:kill` (Emitter: Impostor Only)
Send this to murder a nearby crewmate.
- **Payload**: `{ "roomCode": "ABCDEF", "victimId": "..." }`

#### `game:kill-event` (Listener: All Players)
Notifies a kill happened. The dead body appears on the map at the victim's static location.
- **Payload**: `{ "killerId": "...", "victimId": "...", "position": { "lat": 12.34, "lng": 56.78 } }`

#### `game:report-body` (Emitter: All Alive Players)
Player taps "REPORT" when standing near a dead body (within `REPORT_RANGE_METRES`).
- **Payload**: `{ "roomCode": "ABCDEF", "bodyVictimId": "..." }`
- **Ack Callback**: `{ ok: Boolean, message?: String }`

#### `game:get-bodies` (Emitter: All Players)
Request a list of current un-reported dead bodies on the map.
- **Payload**: `{ "roomCode": "ABCDEF" }`
- **Ack Callback**: `{ ok: Boolean, bodies: [ { victimId: "...", lat: 12.34, lng: 56.78, killedAt: 123456789 } ] }`

### D. Meetings & Voting

#### `game:emergency-meeting` (Emitter: All Alive Players)
Used to call an emergency meeting during Freeplay.
- **Payload**: `{ "roomCode": "ABCDEF" }`
- **Ack Callback**: `{ ok: Boolean, message?: String }`

#### `game:meeting-started` (Listener: All Players)
Received when a body is reported or an emergency button is pressed. Android should transition to the Meeting/Voting UI.
- **Payload**:
  ```json
  {
    "reason": "body-reported" | "emergency",
    "reporterId": "userId",
    "bodyVictimId": "victimId (if body-reported)",
    "bodyPosition": { "lat": 1.2, "lng": 3.4 }
  }
  ```

#### `game:vote` (Emitter: All Alive Players)
Player selects an individual to eject, or chooses to skip.
- **Payload**: `{ "roomCode": "ABCDEF", "targetId": "userId (or null to skip)" }`
- **Ack Callback**: `{ ok: Boolean, message?: String }`

#### `game:vote-update` (Listener: All Players)
Signals that someone cast a vote. (Does NOT reveal who they voted for until resolutions, only shows that they HAVE voted).
- **Payload**: `{ "voterId": "...", "targetId": "..." }`

#### `game:resolve-votes` (Emitter: Host Only)
Manually force end the voting phase early. Normally auto-triggers when time expires or all alive players cast a vote.
- **Payload**: `{ "roomCode": "ABCDEF" }`
- **Ack Callback**: `{ ok: Boolean }`

#### `game:vote-result` (Listener: All Players)
Received when the voting phase concludes. Shows who got ejected or if it was a tie.
- **Payload**: `{ "result": { "type": "eject"|"tie", "playerId": "userId" }, "winner": null|"crewmate"|"imposter" }`

#### `game:freeplay-resumed` (Listener: All Players)
Received after voting results are handled (if no one won). Android should return back to the main map UI, resetting positions or wait for further movement logic.
- **Payload**: Empty

### E. Tasks

#### `game:task-complete` (Emitter: Crewmate Only)
Sent when a crewmate finishes a mini-game task.
- **Payload**: `{ "roomCode": "ABCDEF" }`

#### `game:task-progress` (Listener: All Players)
Overall progress bar update for everyone.
- **Payload**: `{ "completed": 5, "total": 25 }`

### F. Chatting (During Meetings)

#### `game:chat` (Emitter: Alive Players Only)
Send a text message during the Meeting phase.
- **Payload**: `{ "roomCode": "ABCDEF", "message": "Red is sus!" }`

#### `game:chat-message` (Listener: All Players)
Triggered when a valid chat message goes through.
- **Payload**: `{ "userId": "...", "message": "Red is sus!", "ts": 1690000000000 }`

#### `game:chat-history` (Emitter)
In case of reconnection during meeting, fetch the chat backlog.
- **Payload**: `{ "roomCode": "ABCDEF" }`
- **Ack Callback**: `{ ok: Boolean, history: [ { userId, message, ts } ] }`

### G. Game Over

#### `game:ended` (Listener: All Players)
The game concludes due to Impostors eliminating enough crew, Crewmates finishing all tasks, or the Impostor being voted out. Show the Victory/Defeat Screen.
- **Payload**: `{ "winner": "crewmate"|"imposter" }`

---

## 7. Socket Error Handling

You should aggressively listen for the `game:error` event to handle bad requests gracefully (e.g., trying to kill out of range, out of cooldown, unauthorized role).

#### `game:error` (Listener)
- **Payload**: `{ "event": "game:kill", "message": "Kill on cooldown, 12s remaining" }`

---

## 8. Android Developer Flow Summary Checklist

1. **Perform Login**: `POST /auth/login` -> Save `accessToken`.
2. **Setup Socket**: Initialize `socket.io` with `auth = { token }`.
3. **Create or Lookup Room**: Use `POST /room/createNew` or `GET /room/<code>/lookup`.
4. **Join Room via Socket**: Emit `lobby:join-room` with `roomCode`. This registers the player AND joins the real-time lobby in one step.
5. **Wait for Host**: Host UI shows start button. Client UI shows waiting spinner.
6. **Host Starts**: Emit `game:start`. All players receive `game:started` & `game:role`.
7. **Freeplay Loop**:
   - Emit `game:move` every 1-2 seconds with GPS location.
   - Listen to `game:player-moved` to render surrounding avatars.
   - Crewmates: Complete tasks -> emit `game:task-complete`.
   - Impostors: Wait for `game:nearby-targets` -> Hit Kill btn -> Emit `game:kill`.
   - Players: Walk past dead bodies -> Hit Report btn -> Emit `game:report-body`.
8. **Meeting Loop**:
   - `game:meeting-started` received -> swap to Chat UI + Player List.
   - Emit `game:chat` & `game:vote`.
   - Await `game:vote-result`.
9. **Victory UI**:
   - `game:ended` -> Display Winners!
   - Navigate back to Lobby or Main Menu.
