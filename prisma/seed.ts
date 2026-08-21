// Development seed data ONLY. Never run automatically in production — see
// the guard below and the README's "Seed / demo data" section.
//
// Run with: npm run db:seed
import { prisma } from "../src/server/db/prisma";

const DEV_USER_EMAIL = "demo@compass.app";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed in production — this creates a fake demo account, " +
        "never a real production user (Section 27)."
    );
  }

  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    create: {
      email: DEV_USER_EMAIL,
      name: "Compass Demo",
      emailVerified: new Date(),
      locale: "en",
      riskProfileId: "WEALTH_BUILDER",
      onboardingCompletedAt: new Date(),
    },
    update: {},
  });

  console.log(`Seeded demo user: ${user.email} (${user.id})`);

  // Sample interests
  for (const key of ["TECH_AI", "MARKET_INDICES"]) {
    await prisma.userInterest.upsert({
      where: { userId_key: { userId: user.id, key } },
      create: { userId: user.id, key },
      update: {},
    });
  }

  // Sample favorites
  for (const assetId of ["sp500", "aapl"]) {
    await prisma.userFavoriteAsset.upsert({
      where: { userId_assetId: { userId: user.id, assetId } },
      create: { userId: user.id, assetId },
      update: {},
    });
  }

  // Sample notification preferences (achievements off, everything else on)
  const prefs: Record<string, boolean> = {
    news: true,
    priceAlerts: true,
    learning: true,
    achievements: false,
  };
  for (const [category, enabled] of Object.entries(prefs)) {
    await prisma.userNotificationPreference.upsert({
      where: { userId_category: { userId: user.id, category } },
      create: { userId: user.id, category, enabled },
      update: { enabled },
    });
  }

  // Sample learning progress: sp500 lesson completed, some XP, one achievement
  await prisma.userLearningProgress.upsert({
    where: { userId_assetId: { userId: user.id, assetId: "sp500" } },
    create: {
      userId: user.id,
      assetId: "sp500",
      completionState: "COMPLETED",
      completedAt: new Date(),
    },
    update: {},
  });

  await prisma.userXPEvent.upsert({
    where: {
      userId_eventType_sourceId: {
        userId: user.id,
        eventType: "lesson_completed",
        sourceId: "sp500",
      },
    },
    create: { userId: user.id, eventType: "lesson_completed", sourceId: "sp500", amount: 50 },
    update: {},
  });

  await prisma.userAchievement.upsert({
    where: { userId_achievementId: { userId: user.id, achievementId: "FIRST_LESSON" } },
    create: { userId: user.id, achievementId: "FIRST_LESSON" },
    update: {},
  });

  await prisma.userLearningStats.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityAt: new Date(),
      assetsExploredSlugs: JSON.stringify(["sp500", "aapl"]),
    },
    update: {},
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
