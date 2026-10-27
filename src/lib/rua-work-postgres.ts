import type { PrismaClient, Prisma } from "@prisma/client";
import { OWNER, DIRECTOR, RuaWorkStore, signedIn, ownerOnly, WorkError } from "./rua-work";

/** Server-side journal. Never exports raw journal rows to clients/search/chat. */
export class PostgresRuaWorkStore {
  constructor(private db: Pick<PrismaClient, "$transaction">) {}
  private async replay(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<Array<{ actor: string; body: string; at: string }>>`
      SELECT actor, body, at FROM rua_private_commands ORDER BY sequence`;
    let at = "";
    const store = new RuaWorkStore(() => at);
    for (const row of rows) { at = row.at; store.execute(row.actor, JSON.parse(row.body)); }
    return { store, setTime: (value: string) => { at = value; } };
  }
  async readDiary(actor: string | null) {
    ownerOnly(actor);
    return this.db.$transaction(async tx => (await this.replay(tx)).store.readDiary(actor));
  }
  async readProject(actor: string | null) {
    ownerOnly(actor);
    return this.db.$transaction(async tx => (await this.replay(tx)).store.readProject(actor));
  }
  async audit(actor: string | null) {
    ownerOnly(actor);
    return this.db.$transaction(async tx => (await this.replay(tx)).store.audit(actor));
  }
  async list(actor: string | null) {
    signedIn(actor);
    if (actor !== OWNER && actor !== DIRECTOR) return [];
    return this.db.$transaction(async tx => (await this.replay(tx)).store.list(actor));
  }
  async execute(actor: string | null, input: unknown) {
    signedIn(actor);
    if (actor !== OWNER && actor !== DIRECTOR) throw new WorkError(404, "Not found");
    return this.db.$transaction(async tx => {
      // All writers use this transaction-scoped lock before reading the journal.
      // READ COMMITTED sees the previous writer after acquiring the lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(724801, 1)`;
      const { store, setTime } = await this.replay(tx);
      const count = store.audit(OWNER).length;
      const at = new Date().toISOString(); setTime(at);
      const result = store.execute(actor, input);
      if (store.audit(OWNER).length !== count) {
        const key = store.audit(OWNER).at(-1)!.key;
        const body = JSON.stringify(input);
        await tx.$executeRaw`INSERT INTO rua_private_commands(actor, request_key, body, at)
          VALUES (${actor}, ${key}, ${body}, ${at})`;
      }
      return result;
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
  }
  close() { /* shared Prisma pool belongs to CRM */ }
}
