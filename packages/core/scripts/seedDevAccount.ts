// One-off dev-account seeder. Creates a real Supabase auth.users row via the
// Admin API (mirrors real signup — not a raw SQL insert), then replicates the
// exact User-row shape auth.service.ts's supabaseSync() creates on first
// login, then runs the same onboarding.service.createOrgForUser() a real
// Guild Leader signup triggers.
//
// Deliberately NOT wired into prisma/seed.ts (that file explicitly creates no
// accounts — see its header comment about a previously-exposed hardcoded
// credential) and deliberately not committed with real credentials baked in.
//
// Usage (run from packages/core), with the Development project's service_role
// key passed inline — never written to a file:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node --env-file=../../apps/web/.env --import tsx scripts/seedDevAccount.ts

import { prisma } from "@guild/db";
import { createOrgForUser } from "../src/services/onboarding.service";
import { writeAuditLog } from "../src/services/audit.service";
import { AUDIT_ACTIONS } from "@guild/shared";

const SEED_EMAIL = "seed.leader@forgekeep.dev";
const SEED_PASSWORD = "SeedLeader123!";
const SEED_DISPLAY_NAME = "Seed Leader";
const SEED_USERNAME = "seed_leader";
const SEED_GUILD_NAME = "Seed Guild";

async function main() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl) throw new Error("SUPABASE_URL not set (expected from apps/web/.env)");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set — pass it inline, see file header");

  // Refuse to run against anything but the Development project ref, as a
  // guard against accidentally pointing this at Production.
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  if (projectRef !== "pibnwquhrnvxpzbagcyo") {
    throw new Error(`Refusing to seed — SUPABASE_URL resolves to project "${projectRef}", expected the Development project (pibnwquhrnvxpzbagcyo)`);
  }

  const existingUser = await prisma.user.findUnique({ where: { email: SEED_EMAIL.toLowerCase() } });
  if (existingUser) {
    console.log(`Already exists: ${SEED_EMAIL} (user id ${existingUser.id}). Nothing to do.`);
    return;
  }

  console.log(`Creating Supabase auth user for ${SEED_EMAIL}...`);
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      email_confirm: true,
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Supabase admin createUser failed (${createRes.status}): ${body}`);
  }
  const { id: supabaseUserId } = (await createRes.json()) as { id: string };
  console.log(`Supabase auth user created: ${supabaseUserId}`);

  // Mirrors auth.service.ts's supabaseSync() "new user" branch exactly.
  const user = await prisma.user.create({
    data: {
      id: supabaseUserId,
      email: SEED_EMAIL.toLowerCase(),
      username: SEED_USERNAME,
      passwordHash: "",
      displayName: SEED_DISPLAY_NAME,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Prisma User row created: ${user.id}`);

  await writeAuditLog({
    actorId: user.id,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    target: "User",
    targetId: user.id,
    detail: { email: user.email, displayName: user.displayName, provider: "supabase", seed: true },
  });

  const org = await createOrgForUser(
    { id: user.id, displayName: user.displayName },
    { accountType: "GUILD_LEADER", guildName: SEED_GUILD_NAME },
  );
  console.log(`Guild created: ${org?.guildId} (${SEED_GUILD_NAME})`);

  console.log("\nSeed account ready:");
  console.log(`  email:    ${SEED_EMAIL}`);
  console.log(`  password: ${SEED_PASSWORD}`);
  console.log(`  role:     GUILD_LEADER of "${SEED_GUILD_NAME}"`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
