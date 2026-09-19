export const ROOM_STATUS = {
  VACANT:   'vacant',
  OCCUPIED: 'occupied',
  GRACE:    'grace',
  OVERDUE:  'overdue',
} as const;

export type RoomStatus = typeof ROOM_STATUS[keyof typeof ROOM_STATUS];

export const SESSION_STATUS = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  VOIDED: 'voided',
} as const;

export type SessionStatus = typeof SESSION_STATUS[keyof typeof SESSION_STATUS];
