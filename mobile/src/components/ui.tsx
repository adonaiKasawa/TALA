import React, { useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
  ScrollView,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { colors, palette, radius, spacing } from './theme';
import { Toast, useFeedback } from './Toast';
export { colors } from './theme';
export const styles = StyleSheet.create({
  welcomeActions: { paddingTop: 20, gap: 4 },
  welcomeSignature: {
    color: '#f5913c',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 20,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 66,
    borderTopWidth: 1,
    borderTopColor: '#292a2d',
    backgroundColor: '#101214',
    paddingHorizontal: 12,
  },
  navItem: {
    minWidth: 60,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navLabel: { color: '#a4a4a8', fontSize: 10, fontWeight: '600' },
  createNav: {
    backgroundColor: '#ffc64b',
    minWidth: 52,
    minHeight: 40,
    height: 40,
    borderRadius: 13,
    borderRightWidth: 4,
    borderRightColor: '#de4b2c',
  },
  topbar: { paddingHorizontal: 20, paddingTop: 12 },
  tabs: { paddingHorizontal: 20 },
  navigation: { flexGrow: 0, flexShrink: 0 },
  videoPlayer: {
    width: '100%',
    height: 280,
    backgroundColor: palette.background,
    marginVertical: 16,
    borderRadius: radius.panel,
  },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  brand: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: -1,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  section: {
    backgroundColor: palette.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.panel,
    marginBottom: 20,
  },
  h2: { color: colors.ink, fontWeight: '700', fontSize: 20, marginBottom: 12 },
  label: {
    color: colors.ink,
    fontWeight: '600',
    marginBottom: 8,
    fontSize: 14,
  },
  field: { marginBottom: spacing.xl },
  input: {
    borderWidth: 1,
    borderColor: palette.controlBorder,
    borderRadius: radius.control,
    padding: 12,
    minHeight: 48,
    color: colors.ink,
    backgroundColor: palette.surface,
    fontSize: 16,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  button: {
    backgroundColor: colors.blue,
    borderRadius: radius.control,
    minHeight: 48,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonText: { fontSize: 16, color: palette.onAccent, fontWeight: '700' },
  secondary: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: { color: colors.blue },
  danger: {
    backgroundColor: palette.dangerSurface,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  dangerText: { color: palette.danger },
  selected: { backgroundColor: palette.accent, borderColor: palette.accent },
  selectedText: { color: palette.onAccent },
  focusedInput: { borderColor: palette.accent, borderWidth: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 44, height: 44 },
  disabled: { opacity: 0.6 },
  notice: {
    backgroundColor: palette.successSurface,
    color: colors.green,
    padding: 14,
    marginBottom: 16,
    borderRadius: 6,
    lineHeight: 22,
  },
  error: { color: colors.red, backgroundColor: palette.dangerSurface },
  text: { color: colors.ink, fontSize: 16, lineHeight: 24, marginBottom: 12 },
  small: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  flex: { flex: 1 },
  link: { color: colors.blue, fontWeight: '600', fontSize: 16 },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 18,
    marginTop: 8,
  },
  code: {
    backgroundColor: colors.bg,
    padding: 14,
    color: colors.ink,
    fontSize: 17,
    marginBottom: 12,
  },
  avatar: { width: 64, height: 64, borderRadius: 16, marginBottom: 16 },
  avatarLetter: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: palette.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
export function Screen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </ScrollView>
  );
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.h2}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize="none"
        {...props}
        selectionColor={palette.accent}
        onFocus={event => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={event => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[
          styles.input,
          focused && styles.focusedInput,
          props.multiline && styles.multiline,
          props.style,
        ]}
      />
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled,
  secondary,
  danger,
  selected,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled: Boolean(disabled),
        ...(selected !== undefined ? { selected } : {}),
      }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && styles.danger,
        selected && styles.selected,
        (disabled || pressed) && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryText,
          danger && styles.dangerText,
          selected && styles.selectedText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Action({
  title,
  work,
  danger = false,
  secondary = false,
}: {
  title: string;
  work: () => Promise<void | false>;
  danger?: boolean;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setError, dismissError] = useFeedback(6500),
    [done, setDone, dismissDone] = useFeedback(3000, 'success');
  async function run() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      if ((await work()) !== false) setDone('Opération effectuée.');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Cette action n’a pas abouti.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Toast message={notice} dismiss={dismissError} />
      <Toast message={done} dismiss={dismissDone} tone="success" />
      <Button
        title={busy ? 'Un instant…' : title}
        onPress={run}
        disabled={busy}
        danger={danger}
        secondary={secondary}
      />
    </View>
  );
}
export function confirm(title: string, message: string) {
  return new Promise<boolean>(resolve =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
