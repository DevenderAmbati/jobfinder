import type {
  AuthUser,
  UserRecord,
  UserTelegramLink,
} from '../entities/User.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<AuthUser | null>;
  create(input: CreateUserInput): Promise<AuthUser>;
  /** Users that have a resume on file — used when scoring shared jobs for everyone. */
  listIdsWithResume(): Promise<string[]>;
  getTelegramLink(userId: string): Promise<UserTelegramLink | null>;
  getTelegramChatId(userId: string): Promise<string | null>;
  /** Creates (or rotates) a one-time /start token for deep-link binding. */
  issueTelegramLinkToken(userId: string, token: string): Promise<void>;
  /**
   * Binds chat id to the user that owns the token. Returns user id on success.
   * Clears the token so it cannot be reused.
   */
  completeTelegramLink(token: string, chatId: string): Promise<string | null>;
  clearTelegramLink(userId: string): Promise<void>;
}
