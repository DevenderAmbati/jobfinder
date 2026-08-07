import type {
  AuthUser,
  UserRecord,
  UserTelegramLink,
} from '../../domain/entities/User.js';
import type {
  CreateUserInput,
  UserRepository,
} from '../../domain/repositories/UserRepository.js';
import { prisma } from './prismaClient.js';

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return row ? toUserRecord(row) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? toAuthUser(row) : null;
  }

  async create(input: CreateUserInput): Promise<AuthUser> {
    const row = await prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        name: input.name?.trim() || null,
      },
    });
    return toAuthUser(row);
  }

  async listIdsWithResume(): Promise<string[]> {
    const rows = await prisma.resume.findMany({
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async getTelegramLink(userId: string): Promise<UserTelegramLink | null> {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        telegramChatId: true,
        telegramLinkedAt: true,
        telegramLinkToken: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      linked: Boolean(row.telegramChatId),
      chatId: row.telegramChatId,
      linkedAt: row.telegramLinkedAt,
      hasPendingToken: Boolean(row.telegramLinkToken),
    };
  }

  async getTelegramChatId(userId: string): Promise<string | null> {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    return row?.telegramChatId ?? null;
  }

  async issueTelegramLinkToken(userId: string, token: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { telegramLinkToken: token },
    });
  }

  async completeTelegramLink(
    token: string,
    chatId: string,
  ): Promise<string | null> {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }

    const owner = await prisma.user.findFirst({
      where: { telegramLinkToken: trimmed },
      select: { id: true },
    });
    if (!owner) {
      return null;
    }

    // Free the chat id if another account already holds it.
    await prisma.user.updateMany({
      where: {
        telegramChatId: chatId,
        NOT: { id: owner.id },
      },
      data: {
        telegramChatId: null,
        telegramLinkedAt: null,
      },
    });

    await prisma.user.update({
      where: { id: owner.id },
      data: {
        telegramChatId: chatId,
        telegramLinkToken: null,
        telegramLinkedAt: new Date(),
      },
    });

    return owner.id;
  }

  async clearTelegramLink(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        telegramChatId: null,
        telegramLinkToken: null,
        telegramLinkedAt: null,
      },
    });
  }
}

function toAuthUser(row: {
  id: string;
  email: string;
  name: string | null;
}): AuthUser {
  return { id: row.id, email: row.email, name: row.name };
}

function toUserRecord(row: {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: Date;
}): UserRecord {
  return {
    ...toAuthUser(row),
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  };
}
