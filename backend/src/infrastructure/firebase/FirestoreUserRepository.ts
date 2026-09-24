import type {
  AuthUser,
  UserRecord,
  UserTelegramLink,
} from '../../domain/entities/User.js';
import type {
  CreateUserInput,
  UserRepository,
} from '../../domain/repositories/UserRepository.js';
import { asDate, getAuth, getFirestore, newId } from './admin.js';

export class FirestoreUserRepository implements UserRepository {
  private db = getFirestore();

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    try {
      const user = await getAuth().getUserByEmail(normalized);
      const snap = await this.db.collection('users').doc(user.uid).get();
      const data = snap.data() ?? {};
      return {
        id: user.uid,
        email: user.email ?? normalized,
        name: (data.name as string | null | undefined) ?? user.displayName ?? null,
        passwordHash: '',
        createdAt: asDate(data.createdAt) ?? new Date(user.metadata.creationTime),
      };
    } catch {
      const q = await this.db
        .collection('users')
        .where('email', '==', normalized)
        .limit(1)
        .get();
      if (q.empty) {
        return null;
      }
      const doc = q.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        email: String(data.email ?? normalized),
        name: (data.name as string | null | undefined) ?? null,
        passwordHash: '',
        createdAt: asDate(data.createdAt) ?? new Date(),
      };
    }
  }

  async findById(id: string): Promise<AuthUser | null> {
    const snap = await this.db.collection('users').doc(id).get();
    if (!snap.exists) {
      try {
        const user = await getAuth().getUser(id);
        return {
          id: user.uid,
          email: user.email ?? '',
          name: user.displayName ?? null,
        };
      } catch {
        return null;
      }
    }
    const data = snap.data() ?? {};
    return {
      id,
      email: String(data.email ?? ''),
      name: (data.name as string | null | undefined) ?? null,
    };
  }

  async create(input: CreateUserInput): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    const name = input.name?.trim() || null;
    let uid = input.uid?.trim() || '';

    if (!uid) {
      if (input.password) {
        const created = await getAuth().createUser({
          email,
          password: input.password,
          displayName: name ?? undefined,
        });
        uid = created.uid;
      } else {
        uid = newId();
      }
    }

    const now = new Date();
    await this.db.collection('users').doc(uid).set(
      {
        email,
        name,
        telegramChatId: null,
        telegramLinkToken: null,
        telegramLinkedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    return { id: uid, email, name };
  }

  async ensureProfile(input: {
    uid: string;
    email: string;
    name?: string | null;
  }): Promise<AuthUser> {
    const ref = this.db.collection('users').doc(input.uid);
    const snap = await ref.get();
    const email = input.email.trim().toLowerCase();
    const name = input.name?.trim() || null;
    const now = new Date();

    if (!snap.exists) {
      await ref.set({
        email,
        name,
        telegramChatId: null,
        telegramLinkToken: null,
        telegramLinkedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const data = snap.data() ?? {};
      await ref.set(
        {
          email: email || data.email,
          ...(name != null ? { name } : {}),
          updatedAt: now,
        },
        { merge: true },
      );
    }

    const latest = (await ref.get()).data() ?? {};
    return {
      id: input.uid,
      email: String(latest.email ?? email),
      name: (latest.name as string | null | undefined) ?? name,
    };
  }

  async listIdsWithResume(): Promise<string[]> {
    const snaps = await this.db.collectionGroup('resume').get();
    const ids = new Set<string>();
    for (const doc of snaps.docs) {
      const userId = doc.ref.parent.parent?.id;
      if (userId) {
        ids.add(userId);
      }
    }
    return [...ids];
  }

  async getTelegramLink(userId: string): Promise<UserTelegramLink | null> {
    const snap = await this.db.collection('users').doc(userId).get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() ?? {};
    return {
      linked: Boolean(data.telegramChatId),
      chatId: (data.telegramChatId as string | null | undefined) ?? null,
      linkedAt: asDate(data.telegramLinkedAt),
      hasPendingToken: Boolean(data.telegramLinkToken),
    };
  }

  async getTelegramChatId(userId: string): Promise<string | null> {
    const snap = await this.db.collection('users').doc(userId).get();
    const data = snap.data();
    return (data?.telegramChatId as string | null | undefined) ?? null;
  }

  async issueTelegramLinkToken(userId: string, token: string): Promise<void> {
    await this.db.collection('users').doc(userId).set(
      {
        telegramLinkToken: token,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }

  async completeTelegramLink(
    token: string,
    chatId: string,
  ): Promise<string | null> {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }

    const q = await this.db
      .collection('users')
      .where('telegramLinkToken', '==', trimmed)
      .limit(1)
      .get();
    if (q.empty) {
      return null;
    }
    const owner = q.docs[0];

    const held = await this.db
      .collection('users')
      .where('telegramChatId', '==', chatId)
      .get();
    const batch = this.db.batch();
    for (const doc of held.docs) {
      if (doc.id !== owner.id) {
        batch.update(doc.ref, {
          telegramChatId: null,
          telegramLinkedAt: null,
          updatedAt: new Date(),
        });
      }
    }
    batch.update(owner.ref, {
      telegramChatId: chatId,
      telegramLinkToken: null,
      telegramLinkedAt: new Date(),
      updatedAt: new Date(),
    });
    await batch.commit();
    return owner.id;
  }

  async clearTelegramLink(userId: string): Promise<void> {
    await this.db.collection('users').doc(userId).set(
      {
        telegramChatId: null,
        telegramLinkToken: null,
        telegramLinkedAt: null,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }
}
