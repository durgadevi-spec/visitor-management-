import { eq } from "drizzle-orm";
import { db } from "./db";
import { systemSettingsTable } from "../shared/schema.ts";

export async function getSystemSettings(organizationId: number) {
  const [settings] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.organizationId, organizationId));

  if (settings) return settings;

  await db.insert(systemSettingsTable).values({ organizationId }).onConflictDoNothing({
    target: systemSettingsTable.organizationId,
  });

  const [initializedSettings] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.organizationId, organizationId));

  if (!initializedSettings) {
    throw new Error("Unable to initialize system settings");
  }

  return initializedSettings;
}
