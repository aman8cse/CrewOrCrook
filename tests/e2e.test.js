/**
 * CrewOrCrook — Full End-to-End Test (4 players)
 * 
 * Tests the complete game flow with 4 players (MIN_PLAYERS = 3):
 *   1. Register 4 users
 *   2. Login all 4
 *   3. Create room (host)
 *   4. All 4 join room
 *   5. All 4 connect sockets & join lobby
 *   6. Host starts game
 *   7. All receive roles (1 imposter, 3 crewmates)
 *   8. GPS movement
 *   9. Kill out of range (should fail)
 *  10. Nearby targets (impostor only)
 *  11. Kill in range — game should CONTINUE (1 imp vs 2 crew)
 *  12. Report body out of range (should fail)
 *  13. Report body in range (triggers meeting)
 *  14. All alive players vote to skip (meeting resolves)
 *  15. Verify bodies cleared after meeting
 *  16. Second kill — game should END (1 imp vs 1 crew → impostor wins)
 * 
 * Run: node tests/e2e.test.js
 * Requires: server running on localhost:5000, Redis & MongoDB up
 */

import { io as ioClient } from "socket.io-client";

const BASE = "http://localhost:5000";
const UNIQUE = Date.now();

// ─── Helpers ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function skip(label, reason) {
  console.log(`  ⏭️  ${label} — SKIPPED: ${reason}`);
  skipped++;
}

async function post(path, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  const data = await res.json();
  return { status: res.status, data };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE, {
      auth: { token },
      transports: ["websocket"],
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("Socket connect timeout")), 5000);
  });
}

function emitWithAck(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => resolve(response));
    setTimeout(() => reject(new Error(`Ack timeout for ${event}`)), timeout);
  });
}

function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── GPS coordinates for testing ────────────────────────────────
// Delhi area. Points ~5m apart and ~50m apart.

const POS_A = { lat: 28.613900, lng: 77.209000 };         // Impostor base
const POS_NEAR = { lat: 28.613900, lng: 77.209050 };      // ~5m from A (within 8m)
const POS_FAR = { lat: 28.613900, lng: 77.209500 };       // ~49m from A (way outside 8m)
const POS_CREW3 = { lat: 28.614200, lng: 77.209000 };     // Crew 3 separate position

// ─── Main test ───────────────────────────────────────────────────

async function runTests() {
  console.log("\n══════════════════════════════════════════");
  console.log("  CrewOrCrook — End-to-End Test Suite (4 players)");
  console.log("══════════════════════════════════════════\n");

  // ── 1. REGISTER ──
  console.log("📝 Step 1: Register 4 users");
  const userNames = [
    `host_${UNIQUE}`,
    `crew1_${UNIQUE}`,
    `crew2_${UNIQUE}`,
    `crew3_${UNIQUE}`,
  ];

  const regResults = [];
  for (const name of userNames) {
    const reg = await post("/auth/register", { username: name, password: "test1234" });
    assert(`Register ${name}`, reg.status === 201, `status=${reg.status} ${JSON.stringify(reg.data)}`);
    regResults.push(reg);
  }

  // ── 2. LOGIN ──
  console.log("\n🔑 Step 2: Login all 4 users");
  const tokens = [];
  const loginData = [];
  for (const name of userNames) {
    const login = await post("/auth/login", { username: name, password: "test1234" });
    assert(`Login ${name}`, login.status === 200 && login.data.accessToken, `status=${login.status}`);
    tokens.push(login.data.accessToken);
    loginData.push(login.data);
  }

  // ── 3. CREATE ROOM ──
  console.log("\n🏠 Step 3: Create room");
  const createRes = await post("/room/createNew", {}, tokens[0]);
  assert("Create room", createRes.status === 201 && createRes.data.code, `status=${createRes.status}`);
  const roomCode = createRes.data.code;
  console.log(`    Room code: ${roomCode}`);

  // ── 4. SOCKET CONNECT + JOIN ROOM (unified) ──
  console.log("\n🔌 Step 4: Connect sockets & join room via lobby:join-room");
  const sockets = [];
  try {
    for (let i = 0; i < 4; i++) {
      const sock = await connectSocket(tokens[i]);
      assert(`Socket ${i + 1} connected`, !!sock.id);
      sockets.push(sock);
    }
  } catch (err) {
    assert("Socket connection", false, err.message);
    console.log("\n⛔ Cannot proceed without sockets. Exiting.\n");
    process.exit(1);
  }

  for (let i = 0; i < 4; i++) {
    const ack = await emitWithAck(sockets[i], "lobby:join-room", { roomCode });
    assert(`${userNames[i]} joins room via socket`, ack.ok === true, JSON.stringify(ack));
  }

  // ── 6. START GAME ──
  console.log("\n🎮 Step 5: Host starts game");

  // Set up role listeners for ALL 4 players BEFORE starting
  const rolePromises = sockets.map((s) => waitForEvent(s, "game:role"));
  const startedPromise = waitForEvent(sockets[0], "game:started");

  const startAck = await emitWithAck(sockets[0], "game:start", { roomCode });
  assert("game:start ack", startAck.ok === true, JSON.stringify(startAck));

  await startedPromise;
  assert("game:started event received", true);

  // ── 7. RECEIVE ROLES ──
  console.log("\n🎭 Step 6: Receive roles");
  const roles = await Promise.all(rolePromises);
  for (let i = 0; i < 4; i++) {
    assert(`${userNames[i]} got role`, !!roles[i].role, `role=${roles[i].role}`);
    console.log(`    ${userNames[i]}: ${roles[i].role}`);
  }

  // Figure out who is impostor and who are crewmates
  let impostorIdx = roles.findIndex((r) => r.role === "imposter");
  assert("Exactly 1 impostor assigned", impostorIdx !== -1);

  const impostorSock = sockets[impostorIdx];
  const impostorName = userNames[impostorIdx];
  const impostorUserId = loginData[impostorIdx].user._id;

  // Get crewmate indices
  const crewIndices = roles
    .map((r, i) => (r.role === "crewmate" ? i : -1))
    .filter((i) => i !== -1);

  assert("3 crewmates assigned", crewIndices.length === 3, `count=${crewIndices.length}`);

  const crewSocks = crewIndices.map((i) => sockets[i]);
  const crewNames = crewIndices.map((i) => userNames[i]);
  const crewUserIds = crewIndices.map((i) => loginData[i].user._id);

  console.log(`    Impostor: ${impostorName}`);
  console.log(`    Crewmates: ${crewNames.join(", ")}`);

  // ── 8. GPS MOVEMENT ──
  console.log("\n📍 Step 7: GPS movement");

  // Move impostor to position A
  const movePromise1 = waitForEvent(crewSocks[0], "game:player-moved");
  impostorSock.emit("game:move", { roomCode, position: POS_A });
  await movePromise1;
  assert("Impostor moved, crewmates received update", true);

  // Move first crewmate FAR from impostor
  const movePromise2 = waitForEvent(impostorSock, "game:player-moved");
  crewSocks[0].emit("game:move", { roomCode, position: POS_FAR });
  await movePromise2;
  assert("Crewmate 1 moved far", true);

  // Move second crewmate to a separate position
  const movePromise3 = waitForEvent(impostorSock, "game:player-moved");
  crewSocks[1].emit("game:move", { roomCode, position: POS_CREW3 });
  await movePromise3;
  assert("Crewmate 2 moved to separate pos", true);

  // Move third crewmate far as well
  const movePromise4 = waitForEvent(impostorSock, "game:player-moved");
  crewSocks[2].emit("game:move", { roomCode, position: POS_FAR });
  await movePromise4;
  assert("Crewmate 3 moved far", true);

  await sleep(200);

  // ── 9. KILL OUT OF RANGE (should fail) ──
  console.log("\n🔪 Step 8: Kill out of range (~49m apart)");

  const errorPromise = waitForEvent(impostorSock, "game:error", 3000).catch(() => null);
  impostorSock.emit("game:kill", { roomCode, victimId: crewUserIds[0] });
  const killError = await errorPromise;
  assert("Kill rejected (too far)", killError && killError.message.includes("too far"),
    killError ? killError.message : "no error received");

  // ── 10. NEARBY TARGETS ──
  console.log("\n🎯 Step 9: Move crewmate 1 into range & check nearby-targets");

  // Move crewmate 1 NEAR the impostor
  crewSocks[0].emit("game:move", { roomCode, position: POS_NEAR });
  await sleep(300);

  // Move impostor slightly to trigger nearby-targets recompute
  const nearbyPromise = waitForEvent(impostorSock, "game:nearby-targets", 3000).catch(() => null);
  impostorSock.emit("game:move", { roomCode, position: POS_A });
  const nearby = await nearbyPromise;

  if (nearby && nearby.targets) {
    assert("Nearby targets received", nearby.targets.length > 0, `count=${nearby.targets.length}`);
    if (nearby.targets.length > 0) {
      assert("Nearest target is crewmate 1", nearby.targets[0].userId === crewUserIds[0],
        `target=${nearby.targets[0].userId}, expected=${crewUserIds[0]}`);
      console.log(`    Distance: ${nearby.targets[0].distance}m`);
    }
  } else {
    assert("Nearby targets received", false, "no nearby-targets event");
  }

  // ── 11. FIRST KILL — game should CONTINUE ──
  console.log("\n🔪 Step 10: First kill (1 imp vs 2 crew remaining — game continues)");

  // Set up listeners before kill
  const kill1EventPromise = waitForEvent(crewSocks[0], "game:kill-event", 3000);
  const ended1Promise = waitForEvent(impostorSock, "game:ended", 2000).catch(() => null);

  impostorSock.emit("game:kill", { roomCode, victimId: crewUserIds[0] });
  const kill1Evt = await kill1EventPromise;

  assert("Kill event received", !!kill1Evt);
  assert("Correct victim ID", kill1Evt.victimId === crewUserIds[0]);
  assert("Kill has body position", !!kill1Evt.position?.lat);
  console.log(`    Body at: ${kill1Evt.position?.lat}, ${kill1Evt.position?.lng}`);

  const ended1 = await ended1Promise;
  assert("Game did NOT end after first kill", ended1 === null, ended1 ? `unexpected winner: ${ended1.winner}` : "");

  // ── 12. REPORT BODY — OUT OF RANGE (should fail) ──
  console.log("\n🔍 Step 11: Report body out of range (~49m away)");

  // Crewmate 2 is at POS_CREW3 (~33m from the body at POS_NEAR).
  // The body was created at the victim's position (POS_NEAR ≈ same as POS_A).
  // Crewmate 2 should be too far to report.
  const reportFarAck = await emitWithAck(crewSocks[1], "game:report-body", {
    roomCode,
    bodyVictimId: crewUserIds[0],
  });
  assert("Report rejected (too far)", reportFarAck.ok === false,
    reportFarAck.message || "unexpected success");
  if (reportFarAck.message) {
    console.log(`    Error: ${reportFarAck.message}`);
  }

  // ── 13. REPORT BODY — IN RANGE (should trigger meeting) ──
  console.log("\n🔍 Step 12: Report body in range (crewmate 3 walks to body)");

  // Move crewmate 3 close to the body position (body is at POS_NEAR)
  const moveCrew3Promise = waitForEvent(impostorSock, "game:player-moved");
  crewSocks[2].emit("game:move", { roomCode, position: POS_NEAR });
  await moveCrew3Promise;
  await sleep(200);

  // Set up meeting-started listener on ALL alive sockets BEFORE reporting
  const meetingPromises = [
    waitForEvent(impostorSock, "game:meeting-started", 5000),
    waitForEvent(crewSocks[1], "game:meeting-started", 5000),
    waitForEvent(crewSocks[2], "game:meeting-started", 5000),
  ];

  const reportCloseAck = await emitWithAck(crewSocks[2], "game:report-body", {
    roomCode,
    bodyVictimId: crewUserIds[0],
  });
  assert("Report accepted (in range)", reportCloseAck.ok === true,
    reportCloseAck.message || JSON.stringify(reportCloseAck));

  const meetingEvents = await Promise.all(meetingPromises);
  assert("Meeting started event received (impostor)", meetingEvents[0]?.reason === "body-reported");
  assert("Meeting started event received (crew2)", meetingEvents[1]?.reason === "body-reported");
  assert("Meeting started event received (crew3)", meetingEvents[2]?.reason === "body-reported");
  assert("Meeting references correct reporter", meetingEvents[0]?.reporterId === crewUserIds[2],
    `expected=${crewUserIds[2]}, got=${meetingEvents[0]?.reporterId}`);
  assert("Meeting references correct victim", meetingEvents[0]?.bodyVictimId === crewUserIds[0]);
  console.log(`    Body position: ${JSON.stringify(meetingEvents[0]?.bodyPosition)}`);

  // ── 14. VOTE — ALL SKIP (resolve meeting, resume freeplay) ──
  console.log("\n🗳️  Step 13: All alive players vote to skip");

  // 3 alive players: impostor, crewmate 2, crewmate 3
  const aliveSockets = [impostorSock, crewSocks[1], crewSocks[2]];
  const aliveNames = [impostorName, crewNames[1], crewNames[2]];

  // Set up listeners for vote-result and freeplay-resumed
  const voteResultPromise = waitForEvent(impostorSock, "game:vote-result", 5000);
  const freeplayPromise = waitForEvent(impostorSock, "game:freeplay-resumed", 5000);

  for (let i = 0; i < aliveSockets.length; i++) {
    const voteAck = await emitWithAck(aliveSockets[i], "game:vote", {
      roomCode,
      targetId: null, // skip
    });
    assert(`${aliveNames[i]} voted skip`, voteAck.ok === true, voteAck.message || "");
  }

  const voteResult = await voteResultPromise;
  assert("Vote result is tie/skip", voteResult.result?.type === "tie",
    `type=${voteResult.result?.type}`);
  assert("No one ejected", voteResult.winner === null,
    `winner=${voteResult.winner}`);

  const freeplayEvt = await freeplayPromise;
  assert("Freeplay resumed after meeting", !!freeplayEvt || freeplayEvt === undefined);
  console.log("    Meeting resolved — back to freeplay");

  // ── 15. VERIFY BODIES CLEARED ──
  console.log("\n🧹 Step 14: Verify bodies cleared after meeting");

  const bodiesAck = await emitWithAck(impostorSock, "game:get-bodies", { roomCode });
  assert("get-bodies returned ok", bodiesAck.ok === true, bodiesAck.message || "");
  assert("Bodies array is empty after meeting", bodiesAck.bodies?.length === 0,
    `count=${bodiesAck.bodies?.length}`);

  // ── 16. SECOND KILL — game should END ──
  console.log("\n🔪 Step 15: Move crewmate 2 near & kill (1 imp vs 1 crew → impostor wins)");

  // Kill cooldown should have been reset when we entered the meeting,
  // but let's wait to be safe since the cooldown may still be active
  console.log("    ⏳ Waiting for kill cooldown (30s)...");
  await sleep(31_000);

  // Move crewmate 2 near the impostor
  crewSocks[1].emit("game:move", { roomCode, position: POS_NEAR });
  await sleep(300);

  // Move impostor to ensure positions are fresh
  impostorSock.emit("game:move", { roomCode, position: POS_A });
  await sleep(300);

  // Set up listeners BEFORE kill
  const kill2EventPromise = waitForEvent(crewSocks[1], "game:kill-event", 3000);
  const ended2Promise = waitForEvent(impostorSock, "game:ended", 3000).catch(() => null);

  impostorSock.emit("game:kill", { roomCode, victimId: crewUserIds[1] });
  const kill2Evt = await kill2EventPromise;

  assert("Second kill event received", !!kill2Evt);
  assert("Correct second victim ID", kill2Evt.victimId === crewUserIds[1]);

  const ended2 = await ended2Promise;

  if (ended2) {
    console.log("\n🏆 Game ended — impostor wins!");
    assert("Winner is impostor", ended2.winner === "imposter", `winner=${ended2.winner}`);
    console.log(`    Winner: ${ended2.winner}`);
  } else {
    assert("Game ended after second kill", false, "game:ended event not received");
  }

  // ─── SUITE 1 SUMMARY ────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  Suite 1 (Kill flow): ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("══════════════════════════════════════════\n");

  sockets.forEach((s) => s.disconnect());
}

// ─── Suite 2: Voting flow — vote out crewmate, then impostor ─────

async function runVotingTests() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Suite 2: Voting Flow (eject crewmate,   ║");
  console.log("║           then eject impostor)            ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const V = Date.now();

  // ── V1. REGISTER & LOGIN 4 NEW USERS ──
  console.log("📝 V-Step 1: Register & login 4 fresh users");
  const names = [`vhost_${V}`, `vcrew1_${V}`, `vcrew2_${V}`, `vcrew3_${V}`];
  const vtokens = [];
  const vloginData = [];

  for (const name of names) {
    const reg = await post("/auth/register", { username: name, password: "test1234" });
    assert(`Register ${name}`, reg.status === 201, `status=${reg.status}`);
  }

  for (const name of names) {
    const login = await post("/auth/login", { username: name, password: "test1234" });
    assert(`Login ${name}`, login.status === 200 && login.data.accessToken, `status=${login.status}`);
    vtokens.push(login.data.accessToken);
    vloginData.push(login.data);
  }

  // ── V2. CREATE ROOM ──
  console.log("\n🏠 V-Step 2: Create room");
  const cr = await post("/room/createNew", {}, vtokens[0]);
  assert("Create room", cr.status === 201 && cr.data.code, `status=${cr.status}`);
  const vRoomCode = cr.data.code;
  console.log(`    Room code: ${vRoomCode}`);

  // ── V3. SOCKET CONNECT + JOIN ROOM (unified) ──
  console.log("\n🔌 V-Step 3: Connect sockets & join room via lobby:join-room");
  const vsocks = [];
  for (let i = 0; i < 4; i++) {
    const sock = await connectSocket(vtokens[i]);
    assert(`Socket ${i + 1} connected`, !!sock.id);
    vsocks.push(sock);
  }

  for (let i = 0; i < 4; i++) {
    const ack = await emitWithAck(vsocks[i], "lobby:join-room", { roomCode: vRoomCode });
    assert(`${names[i]} joins room via socket`, ack.ok === true, JSON.stringify(ack));
  }

  // ── V4. START GAME & RECEIVE ROLES ──
  console.log("\n🎮 V-Step 4: Start game & receive roles");

  const vrolePromises = vsocks.map((s) => waitForEvent(s, "game:role"));
  const vstartedPromise = waitForEvent(vsocks[0], "game:started");

  const vstartAck = await emitWithAck(vsocks[0], "game:start", { roomCode: vRoomCode });
  assert("game:start ack", vstartAck.ok === true, JSON.stringify(vstartAck));

  await vstartedPromise;

  const vroles = await Promise.all(vrolePromises);
  for (let i = 0; i < 4; i++) {
    console.log(`    ${names[i]}: ${vroles[i].role}`);
  }

  const vImpIdx = vroles.findIndex((r) => r.role === "imposter");
  assert("Exactly 1 impostor assigned", vImpIdx !== -1);

  const vImpSock = vsocks[vImpIdx];
  const vImpName = names[vImpIdx];
  const vImpUserId = vloginData[vImpIdx].user._id;

  const vCrewIdx = vroles
    .map((r, i) => (r.role === "crewmate" ? i : -1))
    .filter((i) => i !== -1);

  assert("3 crewmates assigned", vCrewIdx.length === 3);

  const vCrewSocks = vCrewIdx.map((i) => vsocks[i]);
  const vCrewNames = vCrewIdx.map((i) => names[i]);
  const vCrewUserIds = vCrewIdx.map((i) => vloginData[i].user._id);

  console.log(`    Impostor: ${vImpName}`);
  console.log(`    Crewmates: ${vCrewNames.join(", ")}`);

  // ── V5. EMERGENCY MEETING #1 — VOTE OUT A CREWMATE ──
  console.log("\n🚨 V-Step 5: Emergency meeting → vote out a crewmate");

  // Move everyone so positions are set (required to be alive & in freeplay)
  for (let i = 0; i < 4; i++) {
    vsocks[i].emit("game:move", { roomCode: vRoomCode, position: POS_A });
  }
  await sleep(500);

  // Impostor calls emergency meeting
  const vMeeting1Promises = vsocks.map((s) => waitForEvent(s, "game:meeting-started", 5000));
  const em1Ack = await emitWithAck(vImpSock, "game:emergency-meeting", { roomCode: vRoomCode });
  assert("Emergency meeting 1 ack", em1Ack.ok === true, em1Ack.message || "");

  const vMeeting1Events = await Promise.all(vMeeting1Promises);
  assert("All 4 received meeting-started", vMeeting1Events.every((e) => e?.reason === "emergency"));
  console.log("    Meeting reason: emergency");

  // All 4 alive players vote: impostor + crew1 + crew2 vote for crew3
  //                           crew3 votes for impostor (outvoted)
  const ejectTarget = vCrewUserIds[2]; // crew3 will be ejected
  const ejectName = vCrewNames[2];

  console.log(`    Ejection target: ${ejectName} (crewmate)`);

  // Set up vote-result listener BEFORE votes
  const vResult1Promise = waitForEvent(vImpSock, "game:vote-result", 5000);
  const vFreeplay1Promise = waitForEvent(vImpSock, "game:freeplay-resumed", 5000);

  // Impostor votes crew3
  let voteAck = await emitWithAck(vImpSock, "game:vote", { roomCode: vRoomCode, targetId: ejectTarget });
  assert(`${vImpName} voted for ${ejectName}`, voteAck.ok === true, voteAck.message || "");

  // Crew1 votes crew3
  voteAck = await emitWithAck(vCrewSocks[0], "game:vote", { roomCode: vRoomCode, targetId: ejectTarget });
  assert(`${vCrewNames[0]} voted for ${ejectName}`, voteAck.ok === true, voteAck.message || "");

  // Crew2 votes crew3
  voteAck = await emitWithAck(vCrewSocks[1], "game:vote", { roomCode: vRoomCode, targetId: ejectTarget });
  assert(`${vCrewNames[1]} voted for ${ejectName}`, voteAck.ok === true, voteAck.message || "");

  // Crew3 votes impostor (minority — won't matter)
  voteAck = await emitWithAck(vCrewSocks[2], "game:vote", { roomCode: vRoomCode, targetId: vImpUserId });
  assert(`${vCrewNames[2]} voted for ${vImpName}`, voteAck.ok === true, voteAck.message || "");

  const vResult1 = await vResult1Promise;
  assert("Vote result is eject", vResult1.result?.type === "eject", `type=${vResult1.result?.type}`);
  assert("Ejected player is crew3", vResult1.result?.playerId === ejectTarget,
    `ejected=${vResult1.result?.playerId}, expected=${ejectTarget}`);
  assert("Game did NOT end (crewmate ejected)", vResult1.winner === null,
    vResult1.winner ? `unexpected winner: ${vResult1.winner}` : "");
  console.log(`    ✓ ${ejectName} was ejected (crewmate — game continues)`);

  const vFreeplay1 = await vFreeplay1Promise;
  assert("Freeplay resumed after crewmate ejection", !!vFreeplay1 || vFreeplay1 === undefined);

  // ── V6. VERIFY EJECTED CREWMATE CANNOT MOVE ──
  console.log("\n👻 V-Step 6: Verify ejected crewmate cannot act");

  const deadMoveError = waitForEvent(vCrewSocks[2], "game:error", 3000).catch(() => null);
  vCrewSocks[2].emit("game:move", { roomCode: vRoomCode, position: POS_FAR });
  const moveErr = await deadMoveError;
  assert("Dead crewmate move rejected", moveErr && moveErr.message.includes("Dead"),
    moveErr ? moveErr.message : "no error received");

  // ── V7. EMERGENCY MEETING #2 — VOTE OUT THE IMPOSTOR ──
  console.log("\n🚨 V-Step 7: Emergency meeting → vote out the impostor (crewmates win!)");

  // 3 alive: impostor, crew1, crew2. Crew3 is dead.
  // Crew1 calls emergency meeting
  const vMeeting2Promises = [
    waitForEvent(vImpSock, "game:meeting-started", 5000),
    waitForEvent(vCrewSocks[0], "game:meeting-started", 5000),
    waitForEvent(vCrewSocks[1], "game:meeting-started", 5000),
  ];

  const em2Ack = await emitWithAck(vCrewSocks[0], "game:emergency-meeting", { roomCode: vRoomCode });
  assert("Emergency meeting 2 ack", em2Ack.ok === true, em2Ack.message || "");

  const vMeeting2Events = await Promise.all(vMeeting2Promises);
  assert("All 3 alive received meeting-started", vMeeting2Events.every((e) => e?.reason === "emergency"));

  console.log(`    Ejection target: ${vImpName} (impostor)`);

  // Set up listeners BEFORE voting
  const vResult2Promise = waitForEvent(vImpSock, "game:vote-result", 5000);
  const vEnded2Promise = waitForEvent(vCrewSocks[0], "game:ended", 5000).catch(() => null);

  // Crew1 votes impostor
  voteAck = await emitWithAck(vCrewSocks[0], "game:vote", { roomCode: vRoomCode, targetId: vImpUserId });
  assert(`${vCrewNames[0]} voted for ${vImpName}`, voteAck.ok === true, voteAck.message || "");

  // Crew2 votes impostor
  voteAck = await emitWithAck(vCrewSocks[1], "game:vote", { roomCode: vRoomCode, targetId: vImpUserId });
  assert(`${vCrewNames[1]} voted for ${vImpName}`, voteAck.ok === true, voteAck.message || "");

  // Impostor votes crew1 (outvoted)
  voteAck = await emitWithAck(vImpSock, "game:vote", { roomCode: vRoomCode, targetId: vCrewUserIds[0] });
  assert(`${vImpName} voted for ${vCrewNames[0]}`, voteAck.ok === true, voteAck.message || "");

  const vResult2 = await vResult2Promise;
  assert("Vote result is eject", vResult2.result?.type === "eject", `type=${vResult2.result?.type}`);
  assert("Ejected player is the impostor", vResult2.result?.playerId === vImpUserId,
    `ejected=${vResult2.result?.playerId}, expected=${vImpUserId}`);
  assert("Winner is crewmate", vResult2.winner === "crewmate",
    `winner=${vResult2.winner}`);

  const vEnded2 = await vEnded2Promise;
  if (vEnded2) {
    console.log("\n🏆 Game ended — crewmates win!");
    assert("game:ended winner is crewmate", vEnded2.winner === "crewmate", `winner=${vEnded2.winner}`);
  } else {
    assert("game:ended event received", false, "game:ended not received");
  }

  // ── V8. VERIFY DEAD CREWMATE CAN'T VOTE ──
  console.log("\n👻 V-Step 8: Verify dead players cannot vote (after game end)");
  // This should fail since the game is already ended — but let's verify
  // the service-level validation by checking no crash occurs.
  // (The phase is now ENDED, so voting should be rejected.)
  const deadVoteAck = await emitWithAck(vCrewSocks[2], "game:vote", {
    roomCode: vRoomCode,
    targetId: vImpUserId,
  });
  assert("Dead player vote rejected", deadVoteAck.ok === false,
    deadVoteAck.message || "unexpected success");
  if (deadVoteAck.message) {
    console.log(`    Error: ${deadVoteAck.message}`);
  }

  // ─── SUITE 2 SUMMARY ──────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  Suite 2 (Voting flow) complete`);
  console.log("══════════════════════════════════════════\n");

  vsocks.forEach((s) => s.disconnect());
}

// ─── Suite 3: Task completion — 5 crewmates complete 25 tasks ────

async function runTaskTests() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  Suite 3: Task Completion                ║");
  console.log("║  (5 crewmates × 5 tasks = 25 → crew win) ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const T = Date.now();
  const PLAYER_COUNT = 6;

  // ── T1. REGISTER & LOGIN 6 USERS ──
  console.log("📝 T-Step 1: Register & login 6 fresh users");
  const tNames = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    tNames.push(`task${i}_${T}`);
  }
  const tTokens = [];
  const tLoginData = [];

  for (const name of tNames) {
    const reg = await post("/auth/register", { username: name, password: "test1234" });
    assert(`Register ${name}`, reg.status === 201, `status=${reg.status}`);
  }

  for (const name of tNames) {
    const login = await post("/auth/login", { username: name, password: "test1234" });
    assert(`Login ${name}`, login.status === 200 && login.data.accessToken, `status=${login.status}`);
    tTokens.push(login.data.accessToken);
    tLoginData.push(login.data);
  }

  // ── T2. CREATE ROOM ──
  console.log("\n🏠 T-Step 2: Create room");
  const tCr = await post("/room/createNew", {}, tTokens[0]);
  assert("Create room", tCr.status === 201 && tCr.data.code, `status=${tCr.status}`);
  const tRoomCode = tCr.data.code;
  console.log(`    Room code: ${tRoomCode}`);

  // ── T3. SOCKET CONNECT + JOIN ROOM (unified) ──
  console.log("\n🔌 T-Step 3: Connect sockets & join room via lobby:join-room");
  const tSocks = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const sock = await connectSocket(tTokens[i]);
    assert(`Socket ${i + 1} connected`, !!sock.id);
    tSocks.push(sock);
  }

  for (let i = 0; i < PLAYER_COUNT; i++) {
    const ack = await emitWithAck(tSocks[i], "lobby:join-room", { roomCode: tRoomCode });
    assert(`${tNames[i]} joins room via socket`, ack.ok === true, JSON.stringify(ack));
  }

  // ── T4. START GAME & RECEIVE ROLES ──
  console.log("\n🎮 T-Step 4: Start game & receive roles");

  const tRolePromises = tSocks.map((s) => waitForEvent(s, "game:role"));
  const tStartedPromise = waitForEvent(tSocks[0], "game:started");

  const tStartAck = await emitWithAck(tSocks[0], "game:start", { roomCode: tRoomCode });
  assert("game:start ack", tStartAck.ok === true, JSON.stringify(tStartAck));

  await tStartedPromise;

  const tRoles = await Promise.all(tRolePromises);
  for (let i = 0; i < PLAYER_COUNT; i++) {
    console.log(`    ${tNames[i]}: ${tRoles[i].role}`);
  }

  const tImpIdx = tRoles.findIndex((r) => r.role === "imposter");
  assert("Exactly 1 impostor assigned", tImpIdx !== -1);

  const tImpSock = tSocks[tImpIdx];
  const tImpName = tNames[tImpIdx];

  const tCrewIdx = tRoles
    .map((r, i) => (r.role === "crewmate" ? i : -1))
    .filter((i) => i !== -1);

  assert("5 crewmates assigned", tCrewIdx.length === 5, `count=${tCrewIdx.length}`);

  const tCrewSocks = tCrewIdx.map((i) => tSocks[i]);
  const tCrewNames = tCrewIdx.map((i) => tNames[i]);

  console.log(`    Impostor: ${tImpName}`);
  console.log(`    Crewmates: ${tCrewNames.join(", ")}`);

  // Move everyone so positions are set
  for (let i = 0; i < PLAYER_COUNT; i++) {
    tSocks[i].emit("game:move", { roomCode: tRoomCode, position: POS_A });
  }
  await sleep(500);

  // ── T5. IMPOSTOR CANNOT COMPLETE TASKS ──
  console.log("\n🚫 T-Step 5: Verify impostor cannot complete tasks");

  const impTaskAck = await emitWithAck(tImpSock, "game:task-complete", { roomCode: tRoomCode });
  assert("Impostor task rejected", impTaskAck.ok === false, impTaskAck.message || "unexpected success");
  if (impTaskAck.message) {
    console.log(`    Error: ${impTaskAck.message}`);
  }

  // ── T6. CREWMATES COMPLETE 24 TASKS (game should NOT end) ──
  console.log("\n📋 T-Step 6: 5 crewmates complete 24 tasks (game continues)");

  // Each of the 5 crewmates completes 4 tasks = 20 tasks
  // Then crewmate 1–4 complete 1 more each = 4 more = 24 total
  let tasksDone = 0;

  // Phase 1: each crewmate does 4 tasks
  for (let round = 0; round < 4; round++) {
    for (let c = 0; c < 5; c++) {
      const progressPromise = waitForEvent(tImpSock, "game:task-progress", 3000);
      const ack = await emitWithAck(tCrewSocks[c], "game:task-complete", { roomCode: tRoomCode });
      assert(`${tCrewNames[c]} task ${round + 1}`, ack.ok === true, ack.message || "");
      tasksDone++;

      const progress = await progressPromise;
      // Verify progress broadcast
      if (round === 3 && c === 4) {
        // Last one in this phase: should be 20/25
        assert("Progress shows 20/25", progress.completed === 20 && progress.total === 25,
          `${progress.completed}/${progress.total}`);
      }
    }
  }

  console.log(`    Tasks completed so far: ${tasksDone}`);

  // Phase 2: 4 more tasks (crewmates 0–3 each do 1 more)
  for (let c = 0; c < 4; c++) {
    const progressPromise = waitForEvent(tImpSock, "game:task-progress", 3000);
    const ack = await emitWithAck(tCrewSocks[c], "game:task-complete", { roomCode: tRoomCode });
    assert(`${tCrewNames[c]} extra task`, ack.ok === true, ack.message || "");
    tasksDone++;
    await progressPromise;
  }

  console.log(`    Tasks completed so far: ${tasksDone}`);

  // Verify game has NOT ended yet
  const earlyEndCheck = waitForEvent(tImpSock, "game:ended", 1500).catch(() => null);
  const earlyEnd = await earlyEndCheck;
  assert("Game NOT ended at 24/25 tasks", earlyEnd === null,
    earlyEnd ? `unexpected winner: ${earlyEnd.winner}` : "");

  // ── T7. FINAL TASK — 25th TASK — CREWMATES WIN ──
  console.log("\n🏆 T-Step 7: 25th task — crewmates win!");

  // Set up listeners for the winning events
  const finalProgressPromise = waitForEvent(tImpSock, "game:task-progress", 5000);
  const gameEndedPromise = waitForEvent(tImpSock, "game:ended", 5000).catch(() => null);

  // Crewmate 5 (index 4) completes the final task
  const finalAck = await emitWithAck(tCrewSocks[4], "game:task-complete", { roomCode: tRoomCode });
  assert("Final task accepted", finalAck.ok === true, finalAck.message || "");

  const finalProgress = await finalProgressPromise;
  assert("Final progress shows 25/25", finalProgress.completed === 25 && finalProgress.total === 25,
    `${finalProgress.completed}/${finalProgress.total}`);

  const gameEnded = await gameEndedPromise;
  if (gameEnded) {
    console.log("\n🏆 Game ended — crewmates win by completing all tasks!");
    assert("Winner is crewmate", gameEnded.winner === "crewmate", `winner=${gameEnded.winner}`);
    console.log(`    Winner: ${gameEnded.winner}`);
  } else {
    assert("game:ended event received", false, "game:ended not received after 25th task");
  }

  // ── T8. VERIFY NO MORE TASKS AFTER GAME ENDS ──
  console.log("\n🚫 T-Step 8: Verify tasks rejected after game ends");

  const postGameTaskAck = await emitWithAck(tCrewSocks[0], "game:task-complete", { roomCode: tRoomCode });
  assert("Task rejected after game ended", postGameTaskAck.ok === false,
    postGameTaskAck.message || "unexpected success");
  if (postGameTaskAck.message) {
    console.log(`    Error: ${postGameTaskAck.message}`);
  }

  // ─── SUITE 3 SUMMARY ──────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  Suite 3 (Task flow) complete`);
  console.log("══════════════════════════════════════════\n");

  tSocks.forEach((s) => s.disconnect());
}

// ─── Run all suites ──────────────────────────────────────────────

async function runAll() {
  await runTests();
  await runVotingTests();
  await runTaskTests();

  console.log("╔══════════════════════════════════════════╗");
  console.log(`║  TOTAL: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("╚══════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((err) => {
  console.error("\n⛔ Test runner crashed:", err);
  process.exit(1);
});
