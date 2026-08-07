import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '../../domain/entities/User.js';
import type { UserRepository } from '../../domain/repositories/UserRepository.js';
import { AppError } from '../../shared/errors/AppError.js';

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = '30d';

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export interface AuthServiceDeps {
  users: UserRepository;
  jwtSecret: string;
}

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
      throw new AppError('CONFLICT', 'An account with that email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.deps.users.create({
      email,
      passwordHash,
      name: input.name?.trim() || null,
    });
    return { user, token: this.sign(user) };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: AuthUser; token: string }> {
    const email = normalizeEmail(input.email);
    const user = await this.deps.users.findByEmail(email);
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
    };
    return { user: authUser, token: this.sign(authUser) };
  }

  verify(token: string): AuthTokenPayload {
    try {
      const payload = jwt.verify(token, this.deps.jwtSecret) as AuthTokenPayload;
      if (!payload?.sub || !payload.email) {
        throw new AppError('UNAUTHORIZED', 'Invalid token', 401);
      }
      return payload;
    } catch {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }
  }

  private sign(user: AuthUser): string {
    const payload: AuthTokenPayload = { sub: user.id, email: user.email };
    return jwt.sign(payload, this.deps.jwtSecret, { expiresIn: TOKEN_TTL });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
