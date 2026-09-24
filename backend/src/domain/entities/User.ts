export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface UserRecord extends AuthUser {
  /** Empty when using Firebase Auth (no local password hash). */
  passwordHash: string;
  createdAt: Date;
}

export interface UserTelegramLink {
  linked: boolean;
  chatId: string | null;
  linkedAt: Date | null;
  hasPendingToken: boolean;
}
