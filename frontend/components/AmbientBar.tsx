import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, Volume2, VolumeX, Loader } from 'lucide-react-native';
import { Colors, Radius } from '../src/theme';
import { useVoice } from '../src/VoiceContext';

export default function AmbientBar() {
  const insets = useSafeAreaInsets();
  const v = useVoice();
  const pulse = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-100)).current;

  // Slide-in
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  // Pulse animation when recording
  useEffect(() => {
    if (v.isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: false }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
  }, [v.isRecording, pulse]);

  const bgIntensity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.18] });

  let displayText = 'Tap mic to talk';
  if (v.isProcessing) displayText = 'Thinking…';
  else if (v.isRecording) displayText = v.transcript || 'Listening…';
  else if (v.transcript) displayText = `“${v.transcript}”`;
  else if (v.handsFree) displayText = 'Hands-free on';

  return (
    <Animated.View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, transform: [{ translateY: slide }] },
      ]}
    >
      <View style={styles.bar} testID="ambient-bar">
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: Colors.terracotta, opacity: bgIntensity, borderRadius: Radius.pill },
          ]}
        />
        <TouchableOpacity
          onPress={v.toggleMic}
          onLongPress={v.toggleHandsFree}
          activeOpacity={0.75}
          style={[
            styles.micBtn,
            v.isRecording && { backgroundColor: Colors.terracotta },
            v.handsFree && !v.isRecording && { backgroundColor: Colors.ochre },
          ]}
          testID="ambient-mic-btn"
        >
          {v.isProcessing ? (
            <Loader size={18} color="#fff" />
          ) : v.isRecording ? (
            <Mic size={18} color="#fff" />
          ) : (
            <MicOff size={18} color="#fff" />
          )}
        </TouchableOpacity>

        <Text style={styles.text} numberOfLines={1} testID="ambient-text">
          {displayText}
        </Text>

        <TouchableOpacity onPress={v.toggleTTS} style={styles.ttsBtn} testID="ambient-tts-btn">
          {v.ttsEnabled ? (
            <Volume2 size={18} color={Colors.primary} />
          ) : (
            <VolumeX size={18} color={Colors.textTertiary} />
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  bar: {
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#1A362D',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttsBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 12,
  },
});
