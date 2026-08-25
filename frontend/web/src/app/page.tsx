"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/features/auth/AuthPanel";
import { DashboardPanel } from "@/features/dashboard/DashboardPanel";
import { LobbyPanel } from "@/features/lobby/LobbyPanel";
import { GamePanel } from "@/features/game/GamePanel";
import { apiRequest } from "@/lib/api";
import { createSocket } from "@/lib/socket";
import { watchPosition, getCurrentPosition } from "@/lib/location";
import type { ChatMessage, NearbyTarget, PlayerEntry, Position, RoomRecord, UserRecord } from "@/types/game";

type ViewState = "auth" | "dashboard" | "lobby" | "game" | "ended";

function getStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("crew-session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const socketRef = useRef<any>(null);
  const [view, setView] = useState<ViewState>("auth");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [serverState, setServerState] = useState<"connecting" | "connected" | "offline">("offline");
  const [authForm, setAuthForm] = useState({
    username: "",
    password: "",
    email: "",
    zealId: "",
    rollNo: "",
    section: "",
    avatar: "",
  });
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [availableRooms, setAvailableRooms] = useState<RoomRecord[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [playerPositions, setPlayerPositions] = useState<Record<string, Position>>({});
  const [nearbyTargets, setNearbyTargets] = useState<NearbyTarget[]>([]);
  const [bodies, setBodies] = useState<Array<{ victimId: string; lat: number; lng: number }>>([]);
  const [meeting, setMeeting] = useState(false);
  const [voteResult, setVoteResult] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [taskProgress, setTaskProgress] = useState({ completed: 0, total: 25 });
  const [winner, setWinner] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const setSession = useCallback((nextToken: string | null, nextUser: UserRecord | null) => {
    setToken(nextToken);
    setUser(nextUser);
    if (typeof window !== "undefined") {
      if (nextToken && nextUser) {
        window.localStorage.setItem("crew-session", JSON.stringify({ token: nextToken, user: nextUser }));
      } else {
        window.localStorage.removeItem("crew-session");
      }
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    if (!token || loadingAction) return;
    setLoadingAction("refresh");
    try {
      const data = await apiRequest<RoomRecord[]>("/room/available", { token });
      setAvailableRooms(data || []);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to refresh rooms");
    } finally {
      setLoadingAction(null);
    }
  }, [token]);

  const connectSocket = useCallback(
    (jwt: string) => {
      if (socketRef.current) socketRef.current.disconnect();

      const socket = createSocket(jwt, {
        onConnect: () => setServerState("connected"),
        onDisconnect: () => setServerState("offline"),
        onConnectError: () => setServerState("offline"),
        onPlayersList: (payload: { roomCode: string; hostId: string; players: PlayerEntry[] }) => {
          setRoomCode(payload.roomCode);
          setPlayers(payload.players || []);
          setHostId(payload.hostId);
          setView("lobby");
        },
        onGameStarted: () => setMeeting(false),
        onRole: (payload: { role: string }) => {
          setRole(payload.role);
          setView("game");
        },
        onPlayerMoved: (payload: { userId: string; position: Position }) => {
          setPlayerPositions((prev) => ({ ...prev, [payload.userId]: payload.position }));
        },
        onNearbyTargets: (payload: { targets: NearbyTarget[] }) => setNearbyTargets(payload.targets || []),
        onKillEvent: (payload: { victimId: string; position: Position }) => {
          setBodies((prev) => [{ victimId: payload.victimId, lat: payload.position.lat, lng: payload.position.lng }, ...prev]);
        },
        onMeetingStarted: () => {
          setMeeting(true);
          setVoteResult(null);
        },
        onVoteResult: (payload: { result?: { type: string; playerId?: string }; winner?: string | null }) => {
          setVoteResult(payload.result?.type === "eject" ? `Ejected ${payload.result.playerId}` : "No one was ejected");
          if (payload.winner) setWinner(payload.winner);
        },
        onFreeplayResumed: () => {
          setMeeting(false);
          setVoteResult(null);
        },
        onChatMessage: (msg: ChatMessage) => setChat((prev) => [...prev, msg]),
        onTaskProgress: (payload: { completed: number; total: number }) => setTaskProgress({ completed: payload.completed, total: payload.total }),
        onGameError: (payload: { message?: string }) => setToast(payload.message || "Game event failed"),
        onGameEnded: (payload: { winner: string }) => {
          setWinner(payload.winner);
          setView("ended");
          setMeeting(false);
        },
      });

      socketRef.current = socket;
    },
    []
  );

  useEffect(() => {
    const stored = getStoredSession();
    if (stored?.token && stored?.user) {
      setToken(stored.token);
      setUser(stored.user);
      setView("dashboard");
      connectSocket(stored.token);
    }
  }, [connectSocket]);

  useEffect(() => {
    if (!token || !user) return;

    const userId = String(user.id || user._id || "me");
    const syncPosition = (pos: GeolocationPosition) => {
      const nextPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPlayerPositions((prev) => ({ ...prev, [userId]: nextPosition }));
      if (socketRef.current && roomCode) {
        socketRef.current.emit("game:move", { roomCode, position: nextPosition });
      }
    };

    getCurrentPosition().then(syncPosition).catch(() => undefined);
    const stop = watchPosition(syncPosition);
    return () => stop();
  }, [token, user, roomCode]);

  useEffect(() => {
    if (!token) return;
    connectSocket(token);
    void refreshRooms();
  }, [token, connectSocket]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleAuth = async () => {
    if (loadingAction) return;
    setLoadingAction("auth");
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload = authMode === "login"
        ? { username: authForm.username, password: authForm.password }
        : {
            username: authForm.username,
            password: authForm.password,
            email: authForm.email || undefined,
            zealId: authForm.zealId || undefined,
            rollNo: authForm.rollNo || undefined,
            section: authForm.section || undefined,
            avatar: authForm.avatar || undefined,
          };

      const data = await apiRequest<{ accessToken?: string; user?: UserRecord }>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (authMode === "register") {
        setToast("Registration successful. Please log in.");
        setAuthMode("login");
        return;
      }

      const normalizedUser = {
        id: data.user?._id || data.user?.id,
        username: data.user?.username,
        email: data.user?.email,
      };

      setSession(data.accessToken || null, normalizedUser);
      setView("dashboard");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLogout = () => {
    if (loadingAction) return;
    setLoadingAction("logout");
    try {
      setSession(null, null);
      setView("auth");
      setRoomCode("");
      setPlayers([]);
      setRole(null);
      setMeeting(false);
      setWinner(null);
      setChat([]);
      setNearbyTargets([]);
      setBodies([]);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const joinRoom = (code: string) => {
    const target = code.trim();
    if (!target || !socketRef.current) {
      setToast("Room code missing");
      return;
    }
    if (loadingAction) return;
    setLoadingAction("join-room");
    setRoomCode(target);
    socketRef.current.emit("lobby:join-room", { roomCode: target }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) {
        setToast(response?.message || "Unable to join this room");
        return;
      }
      setView("lobby");
    });
  };

  const handleCreateRoom = async () => {
    if (!token || loadingAction) return;
    setLoadingAction("create-room");
    try {
      const data = await apiRequest<{ code: string }>("/room/createNew", {
        method: "POST",
        body: JSON.stringify({}),
        token,
      });
      setRoomCode(data.code);
      setLoadingAction(null);
      joinRoom(data.code);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not create room");
      setLoadingAction(null);
    }
  };

  const handleStartGame = () => {
    if (!roomCode || !socketRef.current || loadingAction) return;
    setLoadingAction("start-game");
    socketRef.current.emit("game:start", { roomCode }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) setToast(response?.message || "Game could not start");
    });
  };

  const handleMove = (position: Position) => {
    if (loadingAction) return;
    setLoadingAction("move");
    setPlayerPositions((prev) => ({ ...prev, [user?.id || "me"]: position }));
    if (socketRef.current && roomCode) {
      socketRef.current.emit("game:move", { roomCode, position });
    }
    setTimeout(() => setLoadingAction(null), 300);
  };

  const handleCompleteTask = () => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction("complete-task");
    socketRef.current.emit("game:task-complete", { roomCode }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) setToast(response?.message || "Task could not be completed");
    });
  };

  const handleEmergencyMeeting = () => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction("emergency-meeting");
    socketRef.current.emit("game:emergency-meeting", { roomCode }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) setToast(response?.message || "Emergency meeting failed");
    });
  };

  const handleReportBody = () => {
    if (!socketRef.current || !roomCode || bodies.length === 0 || loadingAction) return;
    setLoadingAction("report-body");
    const body = bodies[0];
    socketRef.current.emit("game:report-body", { roomCode, bodyVictimId: body.victimId }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) setToast(response?.message || "Body could not be reported");
    });
  };

  const handleKill = () => {
    if (!socketRef.current || !roomCode || nearbyTargets.length === 0 || loadingAction) return;
    setLoadingAction("kill-target");
    socketRef.current.emit("game:kill", { roomCode, victimId: nearbyTargets[0].userId }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) setToast(response?.message || "Kill failed");
    });
  };

  const handleVote = (targetId: string) => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction("vote");
    socketRef.current.emit("game:vote", { roomCode, targetId }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) setToast(response?.message || "Vote failed");
    });
  };

  const handleChat = () => {
    if (!socketRef.current || !roomCode || !chatDraft.trim() || loadingAction) return;
    setLoadingAction("chat");
    socketRef.current.emit("game:chat", { roomCode, message: chatDraft.trim() }, (response: any) => {
      setLoadingAction(null);
      if (!response?.ok) {
        setToast(response?.message || "Chat failed");
        return;
      }
      setChatDraft("");
    });
  };

  const hostName = players.find((p) => p.userId === hostId)?.username || "Host";

  return (
    <div className="app-shell">
      <div className="app-wrap">
        <header className="topbar">
          <div className="logo">
            <div className="logo-mark">C</div>
            <span>CrewOrCrook</span>
          </div>
          <div className="status-pill">{user ? `Signed in as ${user.username}` : "Not signed in"} · {serverState}</div>
        </header>

        {!token ? (
          <section className="auth-page">
            <div className="card hero-panel">
              <div>
                <span className="hero-kicker">Multiplayer map game</span>
                <h1>Find the imposter. Finish the task. Survive the vote.</h1>
                <p>CrewOrCrook is a browser-native social deduction game built around live lobby joins, role assignment, movement checks, body reports, emergency meetings, and task completion.</p>
              </div>
              <div className="hero-grid">
                <div className="stat-box"><strong>6</strong> max players</div>
                <div className="stat-box"><strong>8m</strong> kill range</div>
                <div className="stat-box"><strong>2 min</strong> meeting timer</div>
              </div>
            </div>

            <AuthPanel
              authMode={authMode}
              onModeChange={setAuthMode}
              authForm={authForm}
              onAuthFormChange={(field, value) => setAuthForm((prev) => ({ ...prev, [field]: value }))}
              onSubmit={handleAuth}
              loading={loadingAction === "auth"}
            />
          </section>
        ) : (
          <>
            {view === "dashboard" && (
              <DashboardPanel
                availableRooms={availableRooms}
                roomCodeInput={roomCodeInput}
                setRoomCodeInput={setRoomCodeInput}
                onRefresh={refreshRooms}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={joinRoom}
                onLogout={handleLogout}
                loadingAction={loadingAction}
              />
            )}

            {view === "lobby" && (
              <LobbyPanel
                roomCode={roomCode}
                hostName={hostName}
                players={players}
                hostId={hostId}
                currentUserId={user?.id}
                onStartGame={handleStartGame}
                onBack={() => setView("dashboard")}
                loadingAction={loadingAction}
              />
            )}

            {(view === "game" || view === "ended") && (
              <GamePanel
                role={role}
                roomCode={roomCode}
                players={players}
                currentUserId={user?.id}
                hostId={hostId}
                taskProgress={taskProgress}
                nearbyTargets={nearbyTargets}
                chat={chat}
                chatDraft={chatDraft}
                setChatDraft={setChatDraft}
                onMove={handleMove}
                onKill={handleKill}
                onEmergencyMeeting={handleEmergencyMeeting}
                onReportBody={handleReportBody}
                onCompleteTask={handleCompleteTask}
                onSendChat={handleChat}
                onVote={handleVote}
                voteResult={voteResult}
                meeting={meeting}
                playerPositions={playerPositions}
                bodies={bodies}
                loadingAction={loadingAction}
              />
            )}

            {view === "ended" && (
              <section className="card end-panel">
                <h2>Match complete</h2>
                <p style={{ color: "var(--muted)" }}>
                  {winner === "imposter" ? "The imposter wins this round." : winner === "crewmate" ? "The crew wins this round." : "The game is over."}
                </p>
                <div className="inline-actions">
                  <button className="primary-btn" type="button" onClick={() => setView("dashboard")}>Back to lobby</button>
                  <button className="danger-btn" type="button" onClick={handleLogout}>Log out</button>
                </div>
              </section>
            )}
          </>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
