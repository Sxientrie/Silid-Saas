export const SHIFT_STATUS = {
  OPEN:   'open',
  CLOSED: 'closed',
} as const;

export type ShiftStatus = typeof SHIFT_STATUS[keyof typeof SHIFT_STATUS];
