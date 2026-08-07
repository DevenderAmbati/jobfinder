import { prisma } from './prismaClient.js';
import { logger } from '../../shared/utils/logger.js';

/** bcrypt hash for password `changeme` (same as multi-user migration). */
const OWNER_PASSWORD_HASH =
  '$2b$10$yOLAbH1ekbaVf4mp/kxlZupCghYNOK5wtexe5PVFOSlBY/jFLBFSC';

/**
 * Ensure at least one login exists after migrate on empty / partial DBs.
 * Idempotent — does nothing when any user row is present.
 */
export async function ensureBootstrapOwner(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) {
    return;
  }

  await prisma.user.create({
    data: {
      id: 'legacy_default_user',
      email: 'owner@localhost',
      passwordHash: OWNER_PASSWORD_HASH,
      name: 'Owner',
    },
  });
  logger.warn(
    'Created bootstrap owner account (owner@localhost / changeme) — change password or register a personal account',
  );
}
