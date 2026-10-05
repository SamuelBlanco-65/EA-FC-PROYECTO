import { Feather } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Eyebrow } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useRegister } from '@/features/auth/useAuth';
import { emailError, nameError, passwordError, passwordStrength } from '@/features/auth/validation';
import { colors, fonts, type } from '@/theme';

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
  const valid = !nameError(name) && !emailError(email) && !passwordError(password) && confirm === password;

  const submit = () => {
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (valid && !register.isPending) register.mutate({ email, password, displayName: name });
  };

  return (
    <Screen banner={false} bottomInset>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" hitSlop={12}>
        <Feather name="chevron-left" size={26} color={colors.textPrimary} />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>

      <Eyebrow>Nuevo jugador</Eyebrow>
      <Text style={styles.title}>Crea tu cuenta</Text>
      <Text style={styles.subtitle}>Únete al torneo y sortea tu club.</Text>

      {remote.form ? (
        <View style={styles.formError} accessibilityRole="alert">
          <Feather name="alert-circle" size={22} color={colors.danger} />
          <Text style={styles.formErrorText}>{remote.form}</Text>
        </View>
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
                  <View key={i} style={[styles.segment, i <= strength.level && styles.segmentOn]} />
                ))}
              </View>
              <Text style={[styles.strength, strength.level >= 3 ? { color: colors.accent } : { color: colors.warning }]}>
                {strength.label}
              </Text>
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
  backText: { ...type.bodyStrong, color: colors.textPrimary },
  title: { ...type.titleHero, color: colors.textPrimary, marginTop: 8 },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: 4, marginBottom: 24 },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    marginBottom: 16,
  },
  formErrorText: { ...type.bodyStrong, color: '#FF8A96', flex: 1 },
  form: { gap: 16 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  segments: { flex: 1, flexDirection: 'row', gap: 8 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segmentOn: { backgroundColor: colors.accent },
  strength: { ...type.bodyStrong, fontFamily: fonts.bold, minWidth: 72, textAlign: 'right' },
  submit: { marginTop: 28 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { ...type.body, color: colors.textSecondary },
  footerLink: { ...type.bodyStrong, fontFamily: fonts.bold, color: colors.accent },
});
