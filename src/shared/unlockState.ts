import {
  COOLDOWN_MS,
  EDIT_WINDOW_MS,
  REVERT_DELAY_MS,
  type PasswordLock,
  type Settings,
  type UnlockGuard,
} from './types';

export type UnlockState =
  | { kind: 'no-password' }
  | { kind: 'locked' }
  | { kind: 'cooldown'; unlockAt: number }
  | { kind: 'editing'; editExpiresAt: number }
  | { kind: 'active'; revertAt: number };

export function getUnlockState(password: PasswordLock, now = Date.now()): UnlockState {
  if (!password.enabled) return { kind: 'no-password' };

  // 30-min enjoy period running — changes are live.
  if (password.revertAt > 0 && now < password.revertAt) {
    return { kind: 'active', revertAt: password.revertAt };
  }
  // Enjoy period expired → locked (guard restore happens in getSettings / alarm).
  if (password.revertAt > 0 && now >= password.revertAt) {
    return { kind: 'locked' };
  }
  // 1-min editing window open.
  if (password.editExpiresAt > 0 && now >= password.unlockAt && now < password.editExpiresAt) {
    return { kind: 'editing', editExpiresAt: password.editExpiresAt };
  }
  // Editing window expired without changes → locked (cycle restart).
  if (password.editExpiresAt > 0 && now >= password.editExpiresAt) {
    return { kind: 'locked' };
  }
  // 15-min cooldown running.
  if (password.unlockAt > 0 && now < password.unlockAt) {
    return { kind: 'cooldown', unlockAt: password.unlockAt };
  }

  return { kind: 'locked' };
}

// Called when the user submits the correct password. Starts the 15-min
// cooldown and snapshots every blocking knob for later rollback.
export function withCooldownStarted(settings: Settings, now = Date.now()): Settings {
  const guard: UnlockGuard = {
    enabled: settings.enabled,
    shortFormVideo: { enabled: settings.shortFormVideo.enabled },
    instagram: { mode: settings.instagram.mode },
    feedFilter: { enabled: settings.feedFilter.enabled },
  };
  const unlockAt = now + COOLDOWN_MS;
  return {
    ...settings,
    password: {
      ...settings.password,
      unlockAt,
      editExpiresAt: unlockAt + EDIT_WINDOW_MS,
      revertAt: 0,
      guard,
    },
  };
}

// Called when the user makes a settings change during the 1-min editing
// window. Activates the 30-min enjoy period.
export function withEnjoyStarted(settings: Settings, now = Date.now()): Settings {
  if (settings.password.revertAt > 0) return settings;
  return {
    ...settings,
    password: {
      ...settings.password,
      revertAt: now + REVERT_DELAY_MS,
    },
  };
}

// Called from the Cancel button during cooldown or editing.
export function withUnlockCancelled(settings: Settings): Settings {
  return {
    ...settings,
    password: {
      ...settings.password,
      unlockAt: 0,
      editExpiresAt: 0,
      revertAt: 0,
      guard: null,
    },
  };
}

// Called when the editing window expires without changes, or when the
// enjoy period ends. Clears all timestamps.
export function withTimersCleared(settings: Settings): Settings {
  return {
    ...settings,
    password: {
      ...settings.password,
      unlockAt: 0,
      editExpiresAt: 0,
      revertAt: 0,
      guard: null,
    },
  };
}

// Called when the 30-min enjoy period ends. Restores the guard snapshot
// so disabling the blocker is at most a 30-minute reprieve.
export function withGuardRestored(settings: Settings): Settings {
  const guard = settings.password.guard;
  const cleared: PasswordLock = {
    ...settings.password,
    unlockAt: 0,
    editExpiresAt: 0,
    revertAt: 0,
    guard: null,
  };
  if (!guard) return { ...settings, password: cleared };
  return {
    ...settings,
    enabled: guard.enabled,
    shortFormVideo: { enabled: guard.shortFormVideo.enabled },
    instagram: { mode: guard.instagram.mode },
    feedFilter: { ...settings.feedFilter, enabled: guard.feedFilter.enabled },
    password: cleared,
  };
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
