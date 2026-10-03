// Instant feedback only. The backend validates again (schemas/auth.py) and is the authority.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;
export const MAX_NAME = 40;

export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

export function emailError(value: string): string | null {
  if (!value.trim()) return 'Escribe tu email.';
  return isEmail(value) ? null : 'Introduce un email válido (ej. nombre@correo.com)';
}

export function passwordError(value: string): string | null {
  if (value.length < MIN_PASSWORD) return `Mínimo ${MIN_PASSWORD} caracteres.`;
  if (value.length > MAX_PASSWORD) return `Máximo ${MAX_PASSWORD} caracteres.`;
  return null;
}

export function nameError(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Escribe tu nombre visible.';
  return name.length > MAX_NAME ? `Máximo ${MAX_NAME} caracteres.` : null;
}

export interface Strength {
  /** 0-4 active segments of the meter. */
  level: number;
  label: string;
}

export function passwordStrength(value: string): Strength {
  if (!value) return { level: 0, label: '' };
  let level = 0;
  if (value.length >= MIN_PASSWORD) level += 1;
  if (value.length >= 12) level += 1;
  if (/[a-zA-Z]/.test(value) && /\d/.test(value)) level += 1;
  if (/[^a-zA-Z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) level += 1;
  const labels = ['Débil', 'Débil', 'Aceptable', 'Buena', 'Segura'];
  return { level, label: labels[level] };
}
