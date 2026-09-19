import type { USER_ROLE } from '@/constants/roles.constants'

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE]

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  branch_id: string | null
}

export interface JwtClaims {
  sub: string
  email: string
  role: UserRole
  branch_id: string | null
  exp: number
  iat: number
}
