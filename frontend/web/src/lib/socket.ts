import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function createSocket(token: string, handlers: Record<string, (...args: any[]) => void>) {
  const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"],
  });

  socket.on("connect", handlers.onConnect || (() => undefined));
  socket.on("disconnect", handlers.onDisconnect || (() => undefined));
  socket.on("connect_error", handlers.onConnectError || (() => undefined));
  socket.on("lobby:players-list", handlers.onPlayersList || (() => undefined));
  socket.on("game:started", handlers.onGameStarted || (() => undefined));
  socket.on("game:role", handlers.onRole || (() => undefined));
  socket.on("game:player-moved", handlers.onPlayerMoved || (() => undefined));
  socket.on("game:nearby-targets", handlers.onNearbyTargets || (() => undefined));
  socket.on("game:kill-event", handlers.onKillEvent || (() => undefined));
  socket.on("game:meeting-started", handlers.onMeetingStarted || (() => undefined));
  socket.on("game:vote-result", handlers.onVoteResult || (() => undefined));
  socket.on("game:freeplay-resumed", handlers.onFreeplayResumed || (() => undefined));
  socket.on("game:chat-message", handlers.onChatMessage || (() => undefined));
  socket.on("game:task-progress", handlers.onTaskProgress || (() => undefined));
  socket.on("game:error", handlers.onGameError || (() => undefined));
  socket.on("game:ended", handlers.onGameEnded || (() => undefined));

  return socket as Socket;
}
