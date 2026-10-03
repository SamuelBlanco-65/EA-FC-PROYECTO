import { Feather } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, radii, shadows, type } from '@/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  icon?: FeatherName;
  error?: string | null;
  helper?: string;
  /** Green check on the right (inline validation passed). */
  valid?: boolean;
  /** Password field with the "Mostrar" toggle. */
  password?: boolean;
  /** Error colour without a message under the field (e.g. the login form shows one banner instead). */
  invalid?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, icon, error, helper, valid, password, invalid, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasError = !!error || !!invalid;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && !hasError && [styles.focused, shadows.glowAccent],
          hasError && styles.errored,
        ]}
      >
        {icon ? <Feather name={icon} size={20} color={colors.textSecondary} /> : null}
        <TextInput
          ref={ref}
          {...input}
          secureTextEntry={password && !revealed}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.accent}
          style={styles.input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
        />
        {password ? (
          <Pressable onPress={() => setRevealed((v) => !v)} style={styles.reveal} accessibilityRole="button">
            <Feather name={revealed ? 'eye-off' : 'eye'} size={20} color={colors.textPrimary} />
            <Text style={styles.revealText}>{revealed ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : hasError ? (
          <Feather name="alert-circle" size={22} color={colors.danger} />
        ) : valid ? (
          <Feather name="check" size={22} color={colors.accent} />
        ) : null}
      </View>
      {error ? <Text style={[styles.note, { color: colors.danger }]}>{error}</Text> : null}
      {!error && helper ? <Text style={[styles.note, { color: colors.textSecondary }]}>{helper}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textPrimary, marginBottom: 8 },
  field: {
    height: 56,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  focused: { borderColor: colors.accent, borderWidth: 1.5 },
  errored: { borderColor: colors.danger, borderWidth: 1.5 },
  input: { ...type.body, flex: 1, color: colors.textPrimary, paddingVertical: 0 },
  reveal: {
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: -8,
  },
  revealText: { ...type.bodyStrong, color: colors.textPrimary },
  note: { ...type.caption, marginTop: 6 },
});
