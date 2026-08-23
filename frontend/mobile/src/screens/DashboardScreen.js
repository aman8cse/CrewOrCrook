import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';

export function DashboardScreen({ availableRooms, onRefresh, onCreateRoom, roomCodeInput, setRoomCodeInput, onJoinRoom, onLogout }) {
  return (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Game lobby</Text>
        <ActionButton title="Refresh" variant="secondary" onPress={onRefresh} />
      </View>

      <View style={styles.rowActions}>
        <ActionButton title="Create room" onPress={onCreateRoom} />
        <TextInput
          style={[styles.input, { flex: 1, minWidth: 120 }]}
          value={roomCodeInput}
          placeholder="Room code"
          placeholderTextColor="#aab7c7"
          autoCapitalize="characters"
          onChangeText={setRoomCodeInput}
        />
        <ActionButton title="Join" variant="secondary" onPress={() => onJoinRoom(roomCodeInput)} />
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
              <ActionButton title="Join" variant="secondary" onPress={() => onJoinRoom(entry.code)} />
            </View>
          ))
        )}
      </View>

      <ActionButton title="Log out" variant="danger" onPress={onLogout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagePad: {
    padding: 20,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#edf7ff',
    fontSize: 26,
    fontWeight: '800',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: 'rgba(14,24,37,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.3)',
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    color: '#edf7ff',
    fontSize: 18,
    fontWeight: '700',
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
});
