import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTransientMessage } from './useTransientMessage';
type Tone = 'error' | 'success';
const FeedbackContext = createContext<{
  show: (message: string, tone: Tone, duration: number) => number;
  dismiss: (id: number) => void;
} | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{
    message: string;
    tone: Tone;
  } | null>(null);
  const sequence = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback((id: number) => {
    if (id !== sequence.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCurrent(null);
  }, []);
  const show = useCallback(
    (message: string, tone: Tone, duration: number) => {
      const id = ++sequence.current;
      if (timer.current) clearTimeout(timer.current);
      setCurrent({ message, tone });
      timer.current = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <FeedbackContext.Provider value={value}>
      <View style={s.host}>
        {children}
        {current && (
          <Toast
            message={current.message}
            tone={current.tone}
            dismiss={() => dismiss(sequence.current)}
          />
        )}
      </View>
    </FeedbackContext.Provider>
  );
}
export function useFeedback(duration = 4500, tone: Tone = 'error') {
  const host = useContext(FeedbackContext),
    owner = useRef(0);
  const [fallback, showFallback, dismissFallback] =
    useTransientMessage(duration);
  const show = useCallback(
    (message: string) => {
      if (host) {
        if (message) owner.current = host.show(message, tone, duration);
        else host.dismiss(owner.current);
      } else showFallback(message);
    },
    [host, tone, duration, showFallback],
  );
  const dismiss = useCallback(() => {
    if (host) host.dismiss(owner.current);
    else dismissFallback();
  }, [host, dismissFallback]);
  useEffect(
    () => () => {
      if (host) host.dismiss(owner.current);
    },
    [host],
  );
  return [host ? '' : fallback, show, dismiss] as const;
}
export function Toast({
  message,
  dismiss,
  tone = 'error',
}: {
  message: string;
  dismiss: () => void;
  tone?: 'error' | 'success';
}) {
  if (!message) return null;
  return (
    <View style={s.wrapper} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={message + ' — fermer'}
        accessibilityLiveRegion="polite"
        onPress={dismiss}
        style={[s.toast, tone === 'error' ? s.error : s.success]}
      >
        <Text style={s.text}>{message}</Text>
        <Text style={s.close}>×</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  host: { flex: 1 },
  wrapper: {
    position: 'absolute',
    top: 72,
    left: 18,
    right: 18,
    zIndex: 80,
    elevation: 16,
    alignItems: 'center',
  },
  toast: {
    maxWidth: 440,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#222326',
  },
  error: { borderColor: '#9a5c53' },
  success: { borderColor: '#a07c32' },
  text: { color: '#fff', fontSize: 13, lineHeight: 20, flexShrink: 1 },
  close: { color: '#b9b4ab', fontSize: 22 },
});
