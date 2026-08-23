import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { FieldInput } from '../components/FieldInput';

export function AuthScreen({ authMode, setAuthMode, authForm, setAuthForm, onSubmit }) {
  return (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <Text style={styles.brand}>CrewOrCrook</Text>
      <View style={styles.card}>
        <View style={styles.segmentedRow}>
          <ActionButton
            title="Login"
            variant={authMode === 'login' ? 'primary' : 'secondary'}
            onPress={() => setAuthMode('login')}
            style={{ flex: 1 }}
          />
          <ActionButton
            title="Register"
            variant={authMode === 'register' ? 'primary' : 'secondary'}
            onPress={() => setAuthMode('register')}
            style={{ flex: 1 }}
          />
        </View>

        <FieldInput
          value={authForm.username}
          placeholder="Username"
          onChangeText={(text) => setAuthForm((prev) => ({ ...prev, username: text }))}
        />
        <FieldInput
          value={authForm.password}
          placeholder="Password"
          secureTextEntry
          onChangeText={(text) => setAuthForm((prev) => ({ ...prev, password: text }))}
        />

        {authMode === 'register' && (
          <>
            <FieldInput value={authForm.email} placeholder="Email" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, email: text }))} />
            <FieldInput value={authForm.zealId} placeholder="Zeal ID" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, zealId: text }))} />
            <FieldInput value={authForm.rollNo} placeholder="Roll Number" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, rollNo: text }))} />
            <FieldInput value={authForm.section} placeholder="Section" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, section: text }))} />
            <FieldInput value={authForm.avatar} placeholder="Avatar URL" onChangeText={(text) => setAuthForm((prev) => ({ ...prev, avatar: text }))} />
          </>
        )}

        <ActionButton title={authMode === 'login' ? 'Enter the game' : 'Create account'} onPress={onSubmit} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
