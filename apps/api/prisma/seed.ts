import { config } from 'dotenv';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import {
  PrismaClient,
  Role,
  ApprovalStatus,
} from '../src/generated/prisma/client.js';

// Same environment lookup convention as the Nest app and prisma.config.ts:
// apps/api/.env first, then repo-root .env
config({ path: ['.env', '../../.env'], quiet: true });

const PLACEHOLDER_PATTERNS = [
  /^<change-me/i,
  /^change[-_]?me/i,
  /^your[-_]?secret/i,
  /^secret$/i,
  /^changethis/i,
];

interface DemoAccountDefinition {
  email: string;
  fullName: string;
  role: Role;
  envKey: string;
}

const DEMO_ACCOUNTS: DemoAccountDefinition[] = [
  {
    email: 'dispatcher@swiftdrop.local',
    fullName: 'Demo Dispatcher',
    role: Role.DISPATCHER,
    envKey: 'DEMO_DISPATCHER_PASSWORD',
  },
  {
    email: 'courier1@swiftdrop.local',
    fullName: 'Demo Courier',
    role: Role.COURIER,
    envKey: 'DEMO_COURIER_PASSWORD',
  },
  {
    email: 'customer@swiftdrop.local',
    fullName: 'Demo Customer',
    role: Role.CUSTOMER,
    envKey: 'DEMO_CUSTOMER_PASSWORD',
  },
  {
    email: 'merchant@swiftdrop.local',
    fullName: 'Demo Merchant',
    role: Role.MERCHANT,
    envKey: 'DEMO_MERCHANT_PASSWORD',
  },
];

/**
 * Validates that all four required demo password environment variables
 * are set and are not obvious placeholder strings.
 * Throws before any database connection is opened.
 */
function validateDemoPasswords(env: NodeJS.ProcessEnv): Record<string, string> {
  const missingOrInvalid: string[] = [];
  const passwords: Record<string, string> = {};

  for (const account of DEMO_ACCOUNTS) {
    const raw = env[account.envKey];
    if (!raw || raw.trim().length === 0) {
      missingOrInvalid.push(`${account.envKey} is missing or empty`);
      continue;
    }
    const trimmed = raw.trim();
    if (PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed))) {
      missingOrInvalid.push(
        `${account.envKey} contains a placeholder value`,
      );
      continue;
    }
    passwords[account.envKey] = trimmed;
  }

  if (missingOrInvalid.length > 0) {
    throw new Error(
      `[Seed Error] Demo password validation failed:\n  - ` +
        missingOrInvalid.join('\n  - ') +
        `\n\nConfigure valid demo passwords in apps/api/.env or root .env to proceed.`,
    );
  }

  return passwords;
}

async function main() {
  console.log('[Seed] Starting SwiftDrop demo account seed...');

  // 1. Validate all demo passwords before touching the database
  const passwords = validateDemoPasswords(process.env);

  // 2. Validate database connection string
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      '[Seed Error] DATABASE_URL is not defined in environment variables.',
    );
  }

  const hashRounds = Number(process.env.PASSWORD_HASH_ROUNDS) || 12;

  // 3. Connect via PrismaPg adapter and connection pool
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    for (const def of DEMO_ACCOUNTS) {
      const password = passwords[def.envKey];
      const normalizedEmail = def.email.trim().toLowerCase();

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!existing) {
        // Create new demo user
        const passwordHash = await bcrypt.hash(password, hashRounds);
        const created = await prisma.user.create({
          data: {
            email: normalizedEmail,
            fullName: def.fullName,
            passwordHash,
            role: def.role,
            approvalStatus: ApprovalStatus.APPROVED,
            isActive: true,
          },
        });
        console.log(
          `[Seed] Created account: ${created.email} (Role: ${created.role}, ID: ${created.id})`,
        );
        continue;
      }

      // Existing account: preserve UUID, update only changed fields
      const updates: {
        role?: Role;
        fullName?: string;
        approvalStatus?: ApprovalStatus;
        isActive?: boolean;
        passwordHash?: string;
      } = {};
      const changedFields: string[] = [];

      if (existing.role !== def.role) {
        updates.role = def.role;
        changedFields.push(`role (${existing.role} -> ${def.role})`);
      }

      if (existing.fullName !== def.fullName) {
        updates.fullName = def.fullName;
        changedFields.push(
          `fullName ('${existing.fullName}' -> '${def.fullName}')`,
        );
      }

      if (existing.approvalStatus !== ApprovalStatus.APPROVED) {
        updates.approvalStatus = ApprovalStatus.APPROVED;
        changedFields.push(
          `approvalStatus (${existing.approvalStatus} -> ${ApprovalStatus.APPROVED})`,
        );
      }

      if (!existing.isActive) {
        updates.isActive = true;
        changedFields.push('isActive (false -> true)');
      }

      // Verify if password has actually changed to avoid unnecessary hash churn
      let passwordChanged = false;
      if (!existing.passwordHash) {
        passwordChanged = true;
      } else {
        const isMatch = await bcrypt.compare(password, existing.passwordHash);
        if (!isMatch) {
          passwordChanged = true;
        }
      }

      if (passwordChanged) {
        updates.passwordHash = await bcrypt.hash(password, hashRounds);
        changedFields.push('password (hash updated)');
      }

      if (changedFields.length > 0) {
        const updated = await prisma.user.update({
          where: { email: normalizedEmail },
          data: updates,
        });
        console.log(
          `[Seed] Updated account: ${updated.email} (ID: ${updated.id}) — fields: ${changedFields.join(', ')}`,
        );
      } else {
        console.log(
          `[Seed] Account ${existing.email} is already up-to-date (ID: ${existing.id})`,
        );
      }
    }

    console.log('[Seed] SwiftDrop demo accounts seeding completed successfully.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error('[Seed Error] Unexpected error:', err);
  }
  process.exit(1);
});

