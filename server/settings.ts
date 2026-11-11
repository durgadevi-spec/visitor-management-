import { eq } from "drizzle-orm";
import { db } from "./db";
import { systemSettingsTable } from "../shared/schema.ts";

export async function getSystemSettings() {
  const [settings] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, 1));

  if (settings) return settings;

  await db.insert(systemSettingsTable).values({ id: 1 }).onConflictDoNothing();

  const [initializedSettings] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.id, 1));

  if (!initializedSettings) {
    throw new Error("Unable to initialize system settings");
  }

  return initializedSettings;
}
