import type { PrismaClient } from '@prisma/client';

/** bcrypt hash for password `changeme` (same as migration seed). */
const TEST_PASSWORD_HASH =
  '$2b$10$yOLAbH1ekbaVf4mp/kxlZupCghYNOK5wtexe5PVFOSlBY/jFLBFSC';

/**
 * Ensures a user with a resume exists for pipeline tests (shared jobs, per-user matches).
 */
export async function ensureTestUserWithResume(
  prisma: PrismaClient,
  options?: {
    email?: string;
    extractedText?: string;
    markdown?: string;
  },
): Promise<{ id: string; email: string }> {
  const email = options?.email ?? 'pipeline-test@localhost';
  const extractedText =
    options?.extractedText ??
    'Software Engineer TypeScript React Node.js backend APIs';
  const markdown =
    options?.markdown ??
    '# Resume\nSoftware Engineer TypeScript React Node.js backend APIs';

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: TEST_PASSWORD_HASH,
      name: 'Pipeline Test',
    },
    update: {},
  });

  await prisma.resume.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      extractedText,
      markdown,
      embedding: null,
      originalPdfPath: null,
    },
    update: {
      extractedText,
      markdown,
    },
  });

  return { id: user.id, email: user.email };
}
