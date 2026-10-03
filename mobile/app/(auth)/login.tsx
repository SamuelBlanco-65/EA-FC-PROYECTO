import { Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { isApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLogin } from '@/features/auth/useAuth';
import { colors, fonts, shadows, type } from '@/theme';

function loginMessage(error: unknown): string {
  if (!isApiError(error)) return 'No se pudo iniciar sesión.';
  if (error.code === 'INVALID_CREDENTIALS') return 'Email o contraseña incorrectos';
  if (error.isNetwork) return 'No hay conexión con el servidor. Inicia sesión con internet.';
  return error.message;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const login = useLogin();

  const canSubmit = email.trim().length > 0 && password.length > 0;
  const submit = () => {
    if (canSubmit && !login.isPending) login.mutate({ email, password });
  };
  const wrong = login.isError;

  return (
    <Screen glow={wrong ? 'red' : 'green'} banner={false} bottomInset>
      <View style={styles.logo}>
        <Logo />
      </View>

      <Text style={styles.title}>Iniciar sesión</Text>
      <Text style={styles.subtitle}>Entra para ver tu club, la tabla y tus partidos.</Text>

      {wrong ? (
        <View style={[styles.error, shadows.glowDanger]} accessibilityRole="alert">
          <Feather name="alert-circle" size={24} color={colors.danger} />
          <Text style={styles.errorText}>{loginMessage(login.error)}</Text>
        </View>
      ) : null}

      <View style={styles.form}>
        <TextField
          label="Email"
          icon="mail"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (wrong) login.reset();
          }}
          invalid={wrong}
          placeholder="tucorreo@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TextField
          ref={passwordRef}
          label="Contraseña"
          icon="lock"
          password
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (wrong) login.reset();
          }}
          invalid={wrong}
          placeholder="Tu contraseña"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      <Button
        label={login.isPending ? 'Iniciando sesión...' : 'Iniciar sesión'}
        loading={login.isPending}
        disabled={!canSubmit}
        onPress={submit}
        style={styles.submit}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>¿No tienes cuenta? </Text>
        <Link href="/register" style={styles.footerLink}>
          Regístrate
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { marginTop: 24, marginBottom: 48 },
  title: { ...type.titleHero, color: colors.textPrimary },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: 8, marginBottom: 24 },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    marginBottom: 16,
  },
  errorText: { ...type.bodyStrong, color: '#FF8A96', flex: 1 },
  form: { gap: 16 },
  submit: { marginTop: 32 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 48 },
  footerText: { ...type.body, color: colors.textSecondary },
  footerLink: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.accent },
});
