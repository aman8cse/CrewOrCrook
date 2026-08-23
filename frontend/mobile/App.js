import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import MapView, { Marker } from 'react-native-maps';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || API_BASE;

const presetPositions = [
  { lat: 28.6139, lng: 77.209 },
  { lat: 28.6141, lng: 77.2091 },
  { lat: 28.6138, lng: 77.2095 },
  { lat: 28.6132, lng: 77.2092 },
];

export default function App() {
  const socketRef = useRef(null);
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [serverState, setServerState] = useState('offline');
  const [authForm, setAuthForm] = useState({
    username: '',
    password: '',
    email: '',
    zealId: '',
    rollNo: '',
    section: '',
    avatar: '',
  });
  const [availableRooms, setAvailableRooms] = useState([]);
  const [roomCode, setRoomCode] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [role, setRole] = useState(null);
  const [meeting, setMeeting] = useState(false);
  const [winner, setWinner] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [taskProgress, setTaskProgress] = useState({ completed: 0, total: 25 });
  const [playerPositions, setPlayerPositions] = useState({});
  const [nearbyTargets, setNearbyTargets] = useState([]);
  const [bodies, setBodies] = useState([]);
  const [voteResult, setVoteResult] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);

  const currentUserId = user?._id || user?.id;

  const persistSession = useCallback(async (nextToken, nextUser) => {
    setToken(nextToken || '');
    setUser(nextUser);
    if (nextToken && nextUser) {
      await AsyncStorage.setItem('crew-session', JSON.stringify({ token: nextToken, user: nextUser }));
    } else {
      await AsyncStorage.removeItem('crew-session');
    }
  }, []);

  const request = useCallback(
    async (path, options = {}) => {
      const headers = { ...(options.headers || {}) };
      if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }
      return data;
    },
    [token]
  );

  const connectSocket = useCallback((jwt) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(SOCKET_URL, {
      auth: { token: jwt },
      transports: ['websocket'],
    });

    socket.on('connect', () => setServerState('connected'));
    socket.on('disconnect', () => setServerState('offline'));
    socket.on('connect_error', () => setServerState('offline'));

    socket.on('lobby:players-list', (payload) => {
      setRoomCode(payload.roomCode);
      setPlayers(payload.players || []);
      setHostId(payload.hostId);
      setScreen('lobby');
    });

    socket.on('game:started', () => setScreen('game'));
    socket.on('game:role', (payload) => {
      setRole(payload.role);
      setScreen('game');
    });

    socket.on('game:player-moved', (payload) => {
      // no-op, local map structure is kept in simple state only for a single player
    });

    socket.on('game:nearby-targets', (payload) => setNearbyTargets(payload.targets || []));
    socket.on('game:kill-event', (payload) => {
      setBodies((prev) => [{ victimId: payload.victimId, lat: payload.position.lat, lng: payload.position.lng }, ...prev]);
    });
    socket.on('game:meeting-started', () => setMeeting(true));
    socket.on('game:vote-result', (payload) => {
      if (payload?.result?.type === 'eject') {
        setVoteResult(`Ejected ${payload.result.playerId}`);
      } else {
        setVoteResult('No one was ejected');
      }
    });
    socket.on('game:freeplay-resumed', () => {
      setMeeting(false);
      setVoteResult(null);
    });
    socket.on('game:chat-message', (msg) => setChatMessages((prev) => [...prev, msg]));
    socket.on('game:task-progress', (payload) => setTaskProgress({ completed: payload.completed, total: payload.total }));
    socket.on('game:error', (payload) => Alert.alert('Game error', payload.message || 'Unexpected error'));
    socket.on('game:ended', (payload) => {
      setWinner(payload.winner);
      setScreen('ended');
    });

    socketRef.current = socket;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const raw = await AsyncStorage.getItem('crew-session');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token && parsed?.user) {
        setToken(parsed.token);
        setUser(parsed.user);
        setScreen('dashboard');
        connectSocket(parsed.token);
      }

      // request permission and start location watch
      try {
        const { status } = await (await import('expo-location')).requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const Location = await import('expo-location');
          const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 2 }, (loc) => {
            const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            setPlayerPositions((prev) => ({ ...(prev || {}), [parsed?.user?.id || parsed?.user?._id || 'me']: p }));
            if (socketRef.current && roomCode) socketRef.current.emit('game:move', { roomCode, position: p });
          });

          // store watcher to be able to remove later
          globalThis.__crew_location_watcher = watcher;
        }
      } catch (e) {
        // ignore
      }
    };
    bootstrap();
  }, [connectSocket]);

  useEffect(() => {
    if (!token) return;
    connectSocket(token);
    const loadRooms = async () => {
      try {
        const data = await request('/room/available');
        setAvailableRooms(data || []);
      } catch (err) {
        Alert.alert('Room error', err.message);
      }
    };
    loadRooms();
  }, [connectSocket, request, token]);

  const handleAuth = async () => {
    if (loadingAction) return;
    setLoadingAction('auth');
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login'
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

      const data = await request(endpoint, { method: 'POST', body: JSON.stringify(payload) });

      if (authMode === 'register') {
        Alert.alert('Success', 'Registration successful. Please log in.');
        setAuthMode('login');
        return;
      }

      const normalizedUser = {
        id: data.user?._id || data.user?.id,
        username: data.user?.username,
        email: data.user?.email,
      };

      await persistSession(data.accessToken, normalizedUser);
      setScreen('dashboard');
      Alert.alert('Welcome', `Signed in as ${normalizedUser.username}`);
    } catch (err) {
      Alert.alert('Auth error', err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const refreshRooms = async () => {
    if (loadingAction) return;
    setLoadingAction('refresh');
    try {
      const data = await request('/room/available');
      setAvailableRooms(data || []);
    } catch (err) {
      Alert.alert('Refresh error', err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const joinRoom = (code) => {
    const target = code.trim();
    if (!target || !socketRef.current || loadingAction) {
      if (!target || !socketRef.current) Alert.alert('Room error', 'Missing room code');
      return;
    }
    setLoadingAction('join-room');
    setRoomCode(target);
    socketRef.current.emit('lobby:join-room', { roomCode: target }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Join failed', response?.message || 'Could not join room');
        return;
      }
      setScreen('lobby');
    });
  };

  const createRoom = async () => {
    if (loadingAction) return;
    setLoadingAction('create-room');
    try {
      const data = await request('/room/createNew', { method: 'POST', body: JSON.stringify({}) });
      setRoomCode(data.code);
      setLoadingAction(null);
      joinRoom(data.code);
    } catch (err) {
      Alert.alert('Create room error', err.message);
      setLoadingAction(null);
    }
  };

  const startGame = () => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction('start-game');
    socketRef.current.emit('game:start', { roomCode }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Start failed', response?.message || 'Could not start match');
      }
    });
  };

  const sendMove = (position) => {
    if (!socketRef.current || !roomCode) return;
    setLoadingAction('move');
    socketRef.current.emit('game:move', { roomCode, position });
    setTimeout(() => setLoadingAction(null), 250);
  };

  const completeTask = () => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction('complete-task');
    socketRef.current.emit('game:task-complete', { roomCode }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Task error', response?.message || 'Task failed');
      }
    });
  };

  const reportBody = () => {
    if (!socketRef.current || !roomCode || bodies.length === 0 || loadingAction) return;
    setLoadingAction('report-body');
    const body = bodies[0];
    socketRef.current.emit('game:report-body', { roomCode, bodyVictimId: body.victimId }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Report failed', response?.message || 'Body could not be reported');
      }
    });
  };

  const emergencyMeeting = () => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction('emergency-meeting');
    socketRef.current.emit('game:emergency-meeting', { roomCode }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Meeting failed', response?.message || 'Could not start emergency meeting');
      }
    });
  };

  const killClosestTarget = () => {
    if (!socketRef.current || !roomCode || nearbyTargets.length === 0 || loadingAction) return;
    setLoadingAction('kill-target');
    socketRef.current.emit('game:kill', { roomCode, victimId: nearbyTargets[0].userId }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Kill failed', response?.message || 'Kill could not be executed');
      }
    });
  };

  const sendVote = (targetId) => {
    if (!socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction('vote');
    socketRef.current.emit('game:vote', { roomCode, targetId }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Vote failed', response?.message || 'Could not vote');
      }
    });
  };

  const sendChat = () => {
    if (!chatDraft.trim() || !socketRef.current || !roomCode || loadingAction) return;
    setLoadingAction('chat');
    socketRef.current.emit('game:chat', { roomCode, message: chatDraft.trim() }, (response) => {
      setLoadingAction(null);
      if (!response?.ok) {
        Alert.alert('Chat error', response?.message || 'Could not send chat');
      }
      setChatDraft('');
    });
  };

  const logout = async () => {
    if (loadingAction) return;
    setLoadingAction('logout');
    try {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      await persistSession(null, null);
      setScreen('auth');
      setRole(null);
      setWinner(null);
      setMeeting(false);
      setPlayers([]);
      setAvailableRooms([]);
      setChatMessages([]);
      setNearbyTargets([]);
      setBodies([]);
    } finally {
      setLoadingAction(null);
    }
  };

  const relevantVoteTargets = players.filter((player) => player.userId !== currentUserId && player.isConnected);
  const hostName = players.find((player) => player.userId === hostId)?.username || 'Host';

  const renderAuth = () => (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <Text style={styles.brand}>CrewOrCrook</Text>
      <View style={styles.card}>
        <View style={styles.segmentedRow}>
          <TouchableOpacity
            style={[styles.segmentButton, authMode === 'login' && styles.activeSegment]}
            onPress={() => setAuthMode('login')}
          >
            <Text style={[styles.segmentText, authMode === 'login' && styles.activeSegmentText]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, authMode === 'register' && styles.activeSegment]}
            onPress={() => setAuthMode('register')}
          >
            <Text style={[styles.segmentText, authMode === 'register' && styles.activeSegmentText]}>Register</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          value={authForm.username}
          placeholder="Username"
          placeholderTextColor="#aab7c7"
          returnKeyType="next"
          onSubmitEditing={() => { /* no-op, field is focused manually */ }}
          onChangeText={(text) => setAuthForm((prev) => ({ ...prev, username: text }))}
        />
        <TextInput
          style={styles.input}
          value={authForm.password}
          placeholder="Password"
          placeholderTextColor="#aab7c7"
          secureTextEntry
          returnKeyType={authMode === 'login' ? 'done' : 'next'}
          onSubmitEditing={() => {
            if (authMode === 'login') handleAuth();
          }}
          onChangeText={(text) => setAuthForm((prev) => ({ ...prev, password: text }))}
        />

        {authMode === 'register' && (
          <>
            <TextInput style={styles.input} value={authForm.email} placeholder="Email" placeholderTextColor="#aab7c7" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, email: text }))} />
            <TextInput style={styles.input} value={authForm.zealId} placeholder="Zeal ID" placeholderTextColor="#aab7c7" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, zealId: text }))} />
            <TextInput style={styles.input} value={authForm.rollNo} placeholder="Roll Number" placeholderTextColor="#aab7c7" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, rollNo: text }))} />
            <TextInput style={styles.input} value={authForm.section} placeholder="Section" placeholderTextColor="#aab7c7" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, section: text }))} />
            <TextInput style={styles.input} value={authForm.avatar} placeholder="Avatar URL" placeholderTextColor="#aab7c7" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, avatar: text }))} />
          </>
        )}

        <TouchableOpacity style={[styles.primaryButton, loadingAction === 'auth' && styles.disabledButton]} onPress={handleAuth} disabled={loadingAction === 'auth'}>
          <Text style={styles.primaryButtonText}>{loadingAction === 'auth' ? 'Working...' : authMode === 'login' ? 'Enter the game' : 'Create account'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderDashboard = () => (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Game lobby</Text>
        <TouchableOpacity style={[styles.secondaryButton, loadingAction === 'refresh' && styles.disabledButton]} onPress={refreshRooms} disabled={loadingAction === 'refresh'}>
          <Text style={styles.secondaryButtonText}>{loadingAction === 'refresh' ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rowActions}>
        <TouchableOpacity style={[styles.primaryButton, loadingAction === 'create-room' && styles.disabledButton]} onPress={createRoom} disabled={loadingAction === 'create-room'}>
          <Text style={styles.primaryButtonText}>{loadingAction === 'create-room' ? 'Creating...' : 'Create room'}</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { flex: 1, minWidth: 120 }]}
          value={roomCodeInput}
          placeholder="Room code"
          placeholderTextColor="#aab7c7"
          autoCapitalize="characters"
          returnKeyType="done"
          onSubmitEditing={() => joinRoom(roomCodeInput)}
          onChangeText={setRoomCodeInput}
        />
        <TouchableOpacity style={[styles.secondaryButton, loadingAction === 'join-room' && styles.disabledButton]} onPress={() => joinRoom(roomCodeInput)} disabled={loadingAction === 'join-room'}>
          <Text style={styles.secondaryButtonText}>{loadingAction === 'join-room' ? 'Joining...' : 'Join'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Available rooms</Text>
        {availableRooms.length === 0 ? (
          <Text style={styles.subtleText}>No open rooms yet — create one to start a match.</Text>
        ) : (
          availableRooms.map((entry) => (
            <View key={entry.code} style={styles.roomCard}>
              <View>
                <Text style={styles.roomCode}>{entry.code}</Text>
                <Text style={styles.subtleText}>Host: {entry.host?.username || 'Unknown'} • {entry.players?.length || 0}/{entry.maxPlayers}</Text>
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => joinRoom(entry.code)}>
                <Text style={styles.secondaryButtonText}>Join</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={[styles.dangerButton, loadingAction === 'logout' && styles.disabledButton]} onPress={logout} disabled={loadingAction === 'logout'}>
        <Text style={styles.dangerButtonText}>{loadingAction === 'logout' ? 'Logging out...' : 'Log out'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderLobby = () => (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Lobby · {roomCode}</Text>
        <Text style={styles.subtleText}>Host: {hostName}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Players</Text>
        {players.map((player) => (
          <View key={player.playerId} style={[styles.playerCard, hostId === player.userId && styles.hostCard]}>
            <Text style={styles.playerName}>{player.username || 'Unknown'}</Text>
            <Text style={styles.subtleText}>{hostId === player.userId ? 'Host' : 'Crewmate'} • {player.isConnected ? 'Online' : 'Offline'}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rowActions}>
        {hostId === currentUserId && (
          <TouchableOpacity style={[styles.primaryButton, loadingAction === 'start-game' && styles.disabledButton]} onPress={startGame} disabled={loadingAction === 'start-game'}>
            <Text style={styles.primaryButtonText}>{loadingAction === 'start-game' ? 'Starting...' : 'Start game'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('dashboard')}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderGame = () => (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Mission room</Text>
        <View style={[styles.roleBadge, role === 'imposter' ? styles.imposterBadge : styles.crewmateBadge]}>
          <Text style={styles.roleBadgeText}>{role || 'Crewmate'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Map</Text>
        <View style={{ height: 220, borderRadius: 12, overflow: 'hidden' }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{
              latitude: (playerPositions[currentUserId]?.lat) || presetPositions[0].lat,
              longitude: (playerPositions[currentUserId]?.lng) || presetPositions[0].lng,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            }}
          >
            {Object.entries(playerPositions || {}).map(([id, pos]) => (
              <Marker key={id} coordinate={{ latitude: pos.lat, longitude: pos.lng }} />
            ))}
            {bodies.map((b, i) => (
              <Marker key={`body-${i}`} coordinate={{ latitude: b.lat, longitude: b.lng }} />
            ))}
          </MapView>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Movement</Text>
        <View style={styles.buttonWrap}>
          {presetPositions.map((position, index) => (
            <TouchableOpacity key={`${position.lat}-${position.lng}`} style={styles.smallButton} onPress={() => sendMove(position)}>
              <Text style={styles.smallButtonText}>Move {index + 1}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.buttonWrap}>
          {role === 'imposter' && (
            <TouchableOpacity style={[styles.dangerButton, loadingAction === 'kill-target' && styles.disabledButton]} onPress={killClosestTarget} disabled={loadingAction === 'kill-target'}>
              <Text style={styles.dangerButtonText}>{loadingAction === 'kill-target' ? 'Killing...' : 'Kill nearest target'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.secondaryButton, loadingAction === 'emergency-meeting' && styles.disabledButton]} onPress={emergencyMeeting} disabled={loadingAction === 'emergency-meeting'}>
            <Text style={styles.secondaryButtonText}>{loadingAction === 'emergency-meeting' ? 'Calling...' : 'Emergency meeting'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, loadingAction === 'report-body' && styles.disabledButton]} onPress={reportBody} disabled={loadingAction === 'report-body'}>
            <Text style={styles.secondaryButtonText}>{loadingAction === 'report-body' ? 'Reporting...' : 'Report body'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, loadingAction === 'complete-task' && styles.disabledButton]} onPress={completeTask} disabled={loadingAction === 'complete-task'}>
            <Text style={styles.primaryButtonText}>{loadingAction === 'complete-task' ? 'Working...' : 'Complete task'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mission progress</Text>
        <Text style={styles.subtleText}>{taskProgress.completed}/{taskProgress.total} tasks complete</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nearby targets</Text>
        {nearbyTargets.length === 0 ? (
          <Text style={styles.subtleText}>No valid targets nearby.</Text>
        ) : (
          nearbyTargets.map((target) => (
            <View key={target.userId} style={styles.roomCard}>
              <Text>{target.userId}</Text>
              <Text style={styles.subtleText}>{target.distance}m away</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Meeting chat</Text>
        {chatMessages.length === 0 ? (
          <Text style={styles.subtleText}>No messages yet.</Text>
        ) : (
          chatMessages.map((msg, index) => (
            <View key={`${msg.userId}-${msg.ts || index}`} style={styles.chatBubble}>
              <Text style={styles.chatUser}>{msg.userId}</Text>
              <Text style={styles.chatText}>{msg.message}</Text>
            </View>
          ))
        )}
        <View style={styles.rowActions}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={chatDraft}
            placeholder="Say something..."
            placeholderTextColor="#aab7c7"
            returnKeyType="send"
            onSubmitEditing={sendChat}
            onChangeText={setChatDraft}
          />
          <TouchableOpacity style={[styles.primaryButton, loadingAction === 'chat' && styles.disabledButton]} onPress={sendChat} disabled={loadingAction === 'chat'}>
            <Text style={styles.primaryButtonText}>{loadingAction === 'chat' ? 'Sending...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {meeting && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vote</Text>
          {relevantVoteTargets.map((player) => (
            <TouchableOpacity key={player.userId} style={[styles.secondaryButton, loadingAction === 'vote' && styles.disabledButton]} onPress={() => sendVote(player.userId)} disabled={loadingAction === 'vote'}>
              <Text style={styles.secondaryButtonText}>{loadingAction === 'vote' ? 'Voting...' : `Vote ${player.username || 'Player'}`}</Text>
            </TouchableOpacity>
          ))}
          {voteResult && <Text style={styles.warningText}>{voteResult}</Text>}
        </View>
      )}
    </ScrollView>
  );

  const renderEnded = () => (
    <View style={styles.pagePad}>
      <View style={styles.card}>
        <Text style={styles.title}>Match complete</Text>
        <Text style={styles.subtleText}>
          {winner === 'imposter' ? 'The imposter won this round.' : winner === 'crewmate' ? 'The crew won this round.' : 'Game over.'}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('dashboard')}>
          <Text style={styles.primaryButtonText}>Back to lobby</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={logout}>
          <Text style={styles.dangerButtonText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentScreen = () => {
    if (!token) return renderAuth();
    if (screen === 'dashboard') return renderDashboard();
    if (screen === 'lobby') return renderLobby();
    if (screen === 'game') return renderGame();
    if (screen === 'ended') return renderEnded();
    return renderDashboard();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#07111f" />
      {renderCurrentScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  pagePad: {
    padding: 20,
    gap: 16,
  },
  brand: {
    color: '#edf7ff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    color: '#edf7ff',
    fontSize: 26,
    fontWeight: '800',
  },
  card: {
    backgroundColor: 'rgba(14,24,37,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.3)',
    padding: 18,
    gap: 12,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,31,47,0.85)',
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeSegment: {
    backgroundColor: '#47d8ff',
  },
  segmentText: {
    color: '#a4c1d9',
    fontWeight: '700',
  },
  activeSegmentText: {
    color: '#031521',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.3)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    color: '#edf7ff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: '#47d8ff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#021521',
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: 'rgba(124,92,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.4)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#edf7ff',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.65,
  },
  dangerButton: {
    backgroundColor: 'rgba(255,90,118,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,90,118,0.35)',
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#ffd7df',
    fontWeight: '800',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  roomCard: {
    backgroundColor: 'rgba(16,28,40,0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.25)',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomCode: {
    color: '#edf7ff',
    fontSize: 22,
    letterSpacing: 2,
    fontWeight: '800',
  },
  subtleText: {
    color: '#a4c1d9',
    fontSize: 13,
  },
  playerCard: {
    backgroundColor: 'rgba(17,31,47,0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.25)',
    padding: 12,
    marginTop: 8,
  },
  hostCard: {
    borderColor: 'rgba(255,200,87,0.7)',
  },
  playerName: {
    color: '#edf7ff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(71,216,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(71,216,255,0.35)',
  },
  smallButtonText: {
    color: '#edf7ff',
    fontWeight: '700',
  },
  roleBadge: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  crewmateBadge: {
    backgroundColor: 'rgba(61,213,152,0.16)',
    borderColor: 'rgba(61,213,152,0.35)',
  },
  imposterBadge: {
    backgroundColor: 'rgba(255,90,118,0.14)',
    borderColor: 'rgba(255,90,118,0.35)',
  },
  roleBadgeText: {
    color: '#edf7ff',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chatBubble: {
    backgroundColor: 'rgba(124,92,255,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.2)',
    padding: 10,
  },
  chatUser: {
    color: '#a4c1d9',
    fontSize: 11,
    marginBottom: 4,
  },
  chatText: {
    color: '#edf7ff',
  },
  warningText: {
    color: '#ffc857',
    fontWeight: '700',
  },
});
