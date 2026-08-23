import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';

export function createSocket(jwt, handlers) {
  const socket = io(SOCKET_URL, {
    auth: { token: jwt },
    transports: ['websocket'],
  });

  if (handlers.onConnect) socket.on('connect', handlers.onConnect);
  if (handlers.onDisconnect) socket.on('disconnect', handlers.onDisconnect);
  if (handlers.onConnectError) socket.on('connect_error', handlers.onConnectError);
  if (handlers.onPlayersList) socket.on('lobby:players-list', handlers.onPlayersList);
  if (handlers.onGameStarted) socket.on('game:started', handlers.onGameStarted);
  if (handlers.onRole) socket.on('game:role', handlers.onRole);
  if (handlers.onNearbyTargets) socket.on('game:nearby-targets', handlers.onNearbyTargets);
  if (handlers.onKillEvent) socket.on('game:kill-event', handlers.onKillEvent);
  if (handlers.onMeetingStarted) socket.on('game:meeting-started', handlers.onMeetingStarted);
  if (handlers.onVoteResult) socket.on('game:vote-result', handlers.onVoteResult);
  if (handlers.onFreeplayResumed) socket.on('game:freeplay-resumed', handlers.onFreeplayResumed);
  if (handlers.onChatMessage) socket.on('game:chat-message', handlers.onChatMessage);
  if (handlers.onTaskProgress) socket.on('game:task-progress', handlers.onTaskProgress);
  if (handlers.onGameError) socket.on('game:error', handlers.onGameError);
  if (handlers.onGameEnded) socket.on('game:ended', handlers.onGameEnded);

  return socket;
}
