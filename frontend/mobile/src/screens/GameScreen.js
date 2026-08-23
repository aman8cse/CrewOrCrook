import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';

export function GameScreen({ role, taskProgress, nearbyTargets, chatMessages, chatDraft, setChatDraft, onMove, onKill, onEmergencyMeeting, onReportBody, onCompleteTask, onSendChat, onVote, voteResult, meeting, players, currentUserId }) {
  const relevantVoteTargets = players.filter((player) => player.userId !== currentUserId && player.isConnected);

  return (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Mission room</Text>
        <View style={[styles.roleBadge, role === 'imposter' ? styles.imposterBadge : styles.crewmateBadge]}>
          <Text style={styles.roleBadgeText}>{role || 'Crewmate'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Movement</Text>
        <View style={styles.buttonWrap}>
          {[
            { lat: 28.6139, lng: 77.209 },
            { lat: 28.6141, lng: 77.2091 },
            { lat: 28.6138, lng: 77.2095 },
            { lat: 28.6132, lng: 77.2092 },
          ].map((position, index) => (
            <ActionButton key={`${position.lat}-${position.lng}`} title={`Move ${index + 1}`} variant="secondary" onPress={() => onMove(position)} style={{ marginBottom: 8 }} />
          ))}
        </View>
        <View style={styles.buttonWrap}>
          {role === 'imposter' && (<ActionButton title="Kill nearest target" variant="danger" onPress={onKill} />)}
          <ActionButton title="Emergency meeting" variant="secondary" onPress={onEmergencyMeeting} />
          <ActionButton title="Report body" variant="secondary" onPress={onReportBody} />
          <ActionButton title="Complete task" onPress={onCompleteTask} />
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
          <TextInput style={[styles.input, { flex: 1 }]} value={chatDraft} placeholder="Say something..." placeholderTextColor="#aab7c7" onChangeText={setChatDraft} />
          <ActionButton title="Send" onPress={onSendChat} />
        </View>
      </View>

      {meeting && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vote</Text>
          {relevantVoteTargets.map((player) => (
            <ActionButton key={player.userId} title={`Vote ${player.username || 'Player'}`} variant="secondary" onPress={() => onVote(player.userId)} style={{ marginBottom: 8 }} />
          ))}
          {voteResult && <Text style={styles.warningText}>{voteResult}</Text>}
        </View>
      )}
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
  subtleText: {
    color: '#a4c1d9',
    fontSize: 13,
  },
  buttonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
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
