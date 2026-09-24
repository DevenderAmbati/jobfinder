import type { AuthUser } from '../../domain/entities/User.js';
import type { UserRepository } from '../../domain/repositories/UserRepository.js';
import { getAuth } from '../../infrastructure/firebase/admin.js';
import { AppError } from '../../shared/errors/AppError.js';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name?: string | null;
}

export interface AuthServiceDeps {
  users: UserRepository;
}

/**
 * Firebase Auth identity. Clients obtain ID tokens via the Firebase web SDK;
 * the API verifies them with the Admin SDK and ensures a Firestore profile.
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async register(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<{ user: AuthUser; token: string }> {
    const email = normalizeEmail(input.email);
    const password = input.password;
    if (!email || !email.includes('@')) {
      throw new AppError('VALIDATION_ERROR', 'A valid email is required', 400);
    }
    if (password.length < 8) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Password must be at least 8 characters',
        400,
      );
    }

    const existing = await this.deps.users.findByEmail(email);
    if (existing) {
      throw new AppError(
        'CONFLICT',
        'An account with that email already exists',
        409,
      );
    }

    const user = await this.deps.users.create({
      email,
      password,
      name: input.name?.trim() || null,
    });

    // Client should sign in with Firebase SDK; return empty token placeholder.
    // Prefer frontend Firebase Auth — this path is for API/tooling only.
    return { user, token: '' };
  }

  async login(_input: {
    email: string;
    password: string;
  }): Promise<{ user: AuthUser; token: string }> {
    throw new AppError(
      'UNAUTHORIZED',
      'Sign in with Firebase Auth on the client, then call /api/auth/me with an ID token',
      401,
    );
  }

  async verify(token: string): Promise<AuthTokenPayload> {
    try {
      const decoded = await getAuth().verifyIdToken(token);
      const email = decoded.email?.trim().toLowerCase();
      if (!decoded.uid || !email) {
        throw new AppError('UNAUTHORIZED', 'Invalid token', 401);
      }
      return {
        sub: decoded.uid,
        email,
        name: decoded.name ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }
  }

  async ensureProfile(payload: AuthTokenPayload): Promise<AuthUser> {
    if (this.deps.users.ensureProfile) {
      return this.deps.users.ensureProfile({
        uid: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
      });
    }
    const existing = await this.deps.users.findById(payload.sub);
    if (existing) {
      return existing;
    }
    return this.deps.users.create({
      uid: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
    });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
