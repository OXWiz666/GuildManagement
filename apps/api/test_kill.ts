import { prisma } from '@guild/db';
import * as dashboardService from './src/services/dashboard.service';

async function test() {
  try {
    const guildId = "cmqj9mx2e0007uqk0kwmwyr6d"; // Valhalla
    const actorId = "cmqj9msqo0000uqk0asmz87bx"; // Admin user
    const bossName = "Lucus";
    const killedAt = new Date().toISOString();
    const takenGuildId = "cmqj9mx2e0007uqk0kwmwyr6d"; // Valhalla
    
    console.log("Calling markBossRotationKilledByName directly...");
    const result = await dashboardService.markBossRotationKilledByName(
      guildId,
      bossName,
      killedAt,
      takenGuildId,
      actorId
    );
    console.log("Result:", result);
  } catch (error) {
    console.error("CRITICAL ERROR during markBossRotationKilledByName:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
