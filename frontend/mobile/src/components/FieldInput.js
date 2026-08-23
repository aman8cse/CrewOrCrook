import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

export function FieldInput({ value, onChangeText, placeholder, secureTextEntry, style, ...props }) {
  return (
    <TextInput
      {...props}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#aab7c7"
      secureTextEntry={secureTextEntry}
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,160,196,0.3)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    color: '#edf7ff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
