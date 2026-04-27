import type { AuthErrorCode } from "./errors";

export type AuthRole = "ADMIN" | "MERCHANT" | "CUSTOMER";
export type AuthUserStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
export type AuthEstablishmentStatus =
  | "PENDING"
  | "ACTIVE"
  | "BLOCKED"
  | "INACTIVE";

export const ROLE_DEFAULT_REDIRECTS = {
  ADMIN: "/admin",
  MERCHANT: "/estabelecimento",
  CUSTOMER: "/conta",
} as const satisfies Record<AuthRole, `/${string}`>;

export type AuthFieldErrors = Record<string, string[]>;

export type AuthValidationErrors = {
  fieldErrors: AuthFieldErrors;
  formErrors: string[];
};

export type AuthFailure = {
  ok: false;
  code: AuthErrorCode;
  message: string;
  validationErrors?: AuthValidationErrors;
};

export type AuthSuccess<TData> = {
  ok: true;
  data: TData;
};

export type AuthResult<TData> = AuthFailure | AuthSuccess<TData>;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  status: AuthUserStatus;
  phone: string | null;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type AuthSessionContext = {
  session: AuthSession;
  user: AuthUser;
};

export type AuthenticatedSession = AuthSessionContext;

export type AuthLoginSuccess = AuthSessionContext & {
  sessionToken: string;
  redirectTo: string;
};

export type AuthCustomerRegistrationSuccess = AuthLoginSuccess;

export type AuthEstablishment = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  status: AuthEstablishmentStatus;
  phone: string | null;
};

export type AuthMerchantRegistrationSuccess = AuthLoginSuccess & {
  establishment: AuthEstablishment;
};
