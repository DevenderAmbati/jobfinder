import { getAuth } from './admin.js';
import type { UserRepository } from '../../domain/repositories/UserRepository.js';
import { logger } from '../../shared/utils/logger.js';

const BOOTSTRAP_EMAIL = 'owner@localhost';

/**
 * Ensures at least one Firebase Auth + Firestore profile exists for empty projects.
 * Prefer creating users via the Firebase console or frontend register in production.
 */
export async function ensureBootstrapOwner(
  users: UserRepository,
): Promise<void> {
  try {
    const existing = await users.findByEmail(BOOTSTRAP_EMAIL);
    if (existing) {
      return;
    }

    let uid: string | undefined;
    try {
      const authUser = await getAuth().getUserByEmail(BOOTSTRAP_EMAIL);
      uid = authUser.uid;
    } catch {
      const created = await getAuth().createUser({
        email: BOOTSTRAP_EMAIL,
        password: 'changeme',
        displayName: 'Owner',
      });
      uid = created.uid;
      logger.warn(
        'Created bootstrap Auth user owner@localhost / changeme — change immediately',
      );
    }

    await users.create({
      uid,
      email: BOOTSTRAP_EMAIL,
      name: 'Owner',
    });
  } catch (error) {
    logger.warn('Bootstrap owner skipped', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
