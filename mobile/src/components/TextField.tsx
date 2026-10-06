import { Feather } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { metrics, palette, radius, typeV2 } from '@/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  icon?: FeatherName;
  error?: string | null;
  helper?: string;
  /** Check on the right (inline validation passed). */
  valid?: boolean;
  /** Password field with the eye toggle. */
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
          // Only the border COLOUR changes on focus/error: no shadow, elevation or width change
          // (a shadow on focus made Android drop the focus right after the keyboard opened).
          focused && !hasError && styles.focused,
          hasError && styles.errored,
        ]}
      >
        {icon ? <Feather name={icon} size={20} color={palette.textSecondary} /> : null}
        <TextInput
          ref={ref}
          {...input}
          secureTextEntry={password && !revealed}
          placeholderTextColor={palette.textTertiary}
          selectionColor={palette.signal}
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
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Feather name={revealed ? 'eye-off' : 'eye'} size={22} color={palette.textSecondary} />
          </Pressable>
        ) : hasError ? (
          <Feather name="alert-circle" size={22} color={palette.cardRed} />
        ) : valid ? (
          <Feather name="check" size={22} color={palette.positive} />
        ) : null}
      </View>
      {error ? <Text style={[styles.note, { color: palette.dangerText }]}>{error}</Text> : null}
      {!error && helper ? <Text style={[styles.note, { color: palette.textSecondary }]}>{helper}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { ...typeV2.label, color: palette.textSecondary, marginBottom: 8 },
  field: {
    height: metrics.inputHeight,
    borderRadius: radius.input,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  focused: { borderColor: palette.paper },
  errored: { borderColor: palette.cardRed },
  input: { ...typeV2.body, flex: 1, color: palette.paper, paddingVertical: 0 },
  note: { ...typeV2.caption, marginTop: 6 },
});
