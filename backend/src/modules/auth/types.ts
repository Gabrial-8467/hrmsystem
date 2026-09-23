export interface AuthContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    status: string;
    roles: { id: string; code: string; name: string }[];
    permissions: string[];
    isSuperAdmin: boolean;
  };
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  title: string | null;
  locale: string;
  emailVerified: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    timezone: string;
    currency: string;
    logoUrl: string | null;
  } | null;
  roles: { id: string; code: string; name: string }[];
  permissions: string[];
  isSuperAdmin: boolean;
}