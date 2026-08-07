export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface UserRecord extends AuthUser {
  passwordHash: string;
  createdAt: Date;
}

export interface UserTelegramLink {
  linked: boolean;
  chatId: string | null;
  linkedAt: Date | null;
  hasPendingToken: boolean;
}
