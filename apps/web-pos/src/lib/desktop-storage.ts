import { SqliteStorage, type StorageScope } from "@gaespos/sync-client";
import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

let databasePromise: Promise<Database> | undefined;

/** Native storage only; browser sessions must not silently pretend to be durable. */
export async function openDesktopStorage(scope: StorageScope): Promise<SqliteStorage | null> {
  if (!isTauri()) return null;
  databasePromise ??= Database.load("sqlite:gaespos-local.db")
    .then(async (database) => {
      const modes = await database.select<{ journal_mode: string }[]>("PRAGMA journal_mode=WAL");
      if (modes[0]?.journal_mode !== "wal")
        throw new Error("No se pudo preparar el almacenamiento local");
      return database;
    })
    .catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  const database = await databasePromise;
  return new SqliteStorage(database, scope);
}
