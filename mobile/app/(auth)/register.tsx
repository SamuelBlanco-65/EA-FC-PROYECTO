import { Feather } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useRegister } from '@/features/auth/useAuth';
import { emailError, nameError, passwordError, passwordStrength } from '@/features/auth/validation';
import { palette, typeV2 } from '@/theme';

interface ServerErrors {
  email?: string;
  password?: string;
  form?: string;
}

// Stable codes of POST /auth/register (api/auth.py).
function serverErrors(error: unknown): ServerErrors {
  if (!isApiError(error)) return { form: 'No se pudo crear la cuenta.' };
  switch (error.code) {
    case 'EMAIL_ALREADY_REGISTERED':
      return { email: 'Ya existe una cuenta con este email.' };
    case 'INVALID_EMAIL':
      return { email: error.message };
    case 'WEAK_PASSWORD':
      return { password: error.message };
    default:
      return { form: error.isNetwork ? 'No hay conexión con el servidor. Regístrate con internet.' : error.message };
  }
}

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const register = useRegister();

  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));
  const remote = register.isError ? serverErrors(register.error) : {};
  const errors = {
    name: touched.name ? nameError(name) : null,
    email: remote.email ?? (touched.email ? emailError(email) : null),
    password: remote.password ?? (touched.password ? passwordError(password) : null),
    confirm: touched.confirm && confirm !== password ? 'Las contraseñas no coinciden' : null,
  };
  const strength = passwordStrength(password);
  const meterColor = strength.level >= 3 ? palette.positive : palette.cardYellow;
  const valid = !nameError(name) && !emailError(email) && !passwordError(password) && confirm === password;

  const submit = () => {
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (valid && !register.isPending) register.mutate({ email, password, displayName: name });
  };

  return (
    <Screen banner={false} bottomInset>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" hitSlop={12}>
        <Feather name="chevron-left" size={26} color={palette.paper} />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>

      <Text style={styles.title}>Crea tu cuenta</Text>
      <Text style={styles.subtitle}>Únete al torneo y sortea tu club.</Text>

      {remote.form ? (
        <Card variant="danger" style={styles.formError}>
          <Feather name="alert-circle" size={22} color={palette.dangerText} />
          <Text style={styles.formErrorText} accessibilityRole="alert">
            {remote.form}
          </Text>
        </Card>
      ) : null}

      <View style={styles.form}>
        <TextField
          label="Nombre visible"
          value={name}
          onChangeText={setName}
          onBlur={() => touch('name')}
          error={errors.name}
          valid={touched.name && !errors.name && name.trim().length > 0}
          helper="Así te verán los demás en la tabla."
          autoCapitalize="words"
          autoComplete="name"
          maxLength={40}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TextField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (register.isError) register.reset();
          }}
          onBlur={() => touch('email')}
          error={errors.email}
          valid={touched.email && !errors.email && email.length > 0}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <View>
          <TextField
            ref={passwordRef}
            label="Contraseña"
            password
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (register.isError) register.reset();
            }}
            onBlur={() => touch('password')}
            error={errors.password}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            blurOnSubmit={false}
          />
          {password.length > 0 ? (
            <View style={styles.meter}>
              <View style={styles.segments}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={[styles.segment, i <= strength.level && { backgroundColor: meterColor }]} />
                ))}
              </View>
              <Text style={[styles.strength, { color: meterColor }]}>{strength.label}</Text>
            </View>
          ) : null}
        </View>
        <TextField
          ref={confirmRef}
          label="Confirmar contraseña"
          password
          value={confirm}
          onChangeText={setConfirm}
          onBlur={() => touch('confirm')}
          error={errors.confirm}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      <Button
        label={register.isPending ? 'Creando cuenta...' : 'Crear cuenta'}
        loading={register.isPending}
        onPress={submit}
        style={styles.submit}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
        <Link href="/login" replace style={styles.footerLink}>
          Inicia sesión
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 24 },
  backText: { ...typeV2.bodyStrong, color: palette.paper },
  title: { ...typeV2.titleScreen, color: palette.paper },
  subtitle: { ...typeV2.body, color: palette.textSecondary, marginTop: 4, marginBottom: 24 },
  formError: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, marginBottom: 16 },
  formErrorText: { ...typeV2.bodyStrong, color: palette.dangerText, flex: 1 },
  form: { gap: 16 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  segments: { flex: 1, flexDirection: 'row', gap: 8 },
  segment: { flex: 1, height: 4, backgroundColor: palette.line },
  strength: { ...typeV2.bodyStrong, minWidth: 72, textAlign: 'right' },
  submit: { marginTop: 28 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { ...typeV2.body, color: palette.textSecondary },
  footerLink: { ...typeV2.bodyStrong, color: palette.paper, textDecorationLine: 'underline' },
});
