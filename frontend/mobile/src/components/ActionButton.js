import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

export function ActionButton({ title, onPress, variant = 'primary', style }) {
  const variantStyle = variant === 'secondary'
    ? styles.secondaryButton
    : variant === 'danger'
      ? styles.dangerButton
      : styles.primaryButton;

  return (
    <TouchableOpacity style={[variantStyle, style]} onPress={onPress}>
      <Text style={variant === 'secondary' ? styles.secondaryText : variant === 'danger' ? styles.dangerText : styles.primaryText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    backgroundColor: '#47d8ff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  primaryText: {
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
  secondaryText: {
    color: '#edf7ff',
    fontWeight: '700',
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
  dangerText: {
    color: '#ffd7df',
    fontWeight: '800',
  },
});
