import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';

export function EndedScreen({ winner, onBackToLobby, onLogout }) {
  return (
    <View style={styles.pagePad}>
      <View style={styles.card}>
        <Text style={styles.title}>Match complete</Text>
        <Text style={styles.subtleText}>
          {winner === 'imposter' ? 'The imposter won this round.' : winner === 'crewmate' ? 'The crew won this round.' : 'Game over.'}
        </Text>
        <ActionButton title="Back to lobby" onPress={onBackToLobby} style={{ marginTop: 12 }} />
        <ActionButton title="Log out" variant="danger" onPress={onLogout} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pagePad: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'rgba(14,24,37,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.3)',
    padding: 18,
    gap: 12,
  },
  title: {
    color: '#edf7ff',
    fontSize: 26,
    fontWeight: '800',
  },
  subtleText: {
    color: '#a4c1d9',
    fontSize: 14,
  },
});
