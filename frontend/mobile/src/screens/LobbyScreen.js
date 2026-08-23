import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';

export function LobbyScreen({ roomCode, hostName, players, hostId, currentUserId, onStartGame, onBack }) {
  return (
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
          <ActionButton title="Start game" onPress={onStartGame} />
        )}
        <ActionButton title="Back" variant="secondary" onPress={onBack} />
      </View>
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
  subtleText: {
    color: '#a4c1d9',
    fontSize: 13,
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
});
