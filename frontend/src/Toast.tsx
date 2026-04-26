import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { Colors, Radius } from './theme';

type ToastCtx = {
  show: (msg: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);
export const useToast = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside provider');
  return v;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(40)).current;
  const timer = useRef<any>(null);

  const show = useCallback((m: string) => {
    if (!m) return;
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translate, { toValue: 40, duration: 280, useNativeDriver: true }),
      ]).start();
    }, 3500);
  }, [opacity, translate]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { opacity, transform: [{ translateY: translate }] },
        ]}
      >
        <Text style={styles.toastText} numberOfLines={3}>
          {msg}
        </Text>
      </Animated.View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: Radius.input,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 1000,
  },
  toastText: {
    color: '#F9F9F6',
    fontSize: 14,
    lineHeight: 20,
  },
});
