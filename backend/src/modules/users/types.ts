export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  status: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  roles: { id: string; code: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED';