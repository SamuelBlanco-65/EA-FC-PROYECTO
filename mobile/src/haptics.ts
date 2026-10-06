import * as Haptics from 'expo-haptics';

// Feedback only: a device without a vibration motor must never break the action, so errors are swallowed.
export const tapLight = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export const tapSelect = () => {
  Haptics.selectionAsync().catch(() => {});
};
