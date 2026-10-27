import "server-only";
import prisma from "./prisma";
import { PostgresRuaWorkStore } from "./rua-work-postgres";
/** Existing CRM pool only. No fixture auth, local SQLite or synthetic-data fallback. */
export async function openRuaStore() { return new PostgresRuaWorkStore(prisma); }
