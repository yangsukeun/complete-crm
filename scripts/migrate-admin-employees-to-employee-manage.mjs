/**
 * admin_employees → employee_manage 일회성 데이터 마이그레이션
 * (User.permissions · Position.permissions)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function migrateKeys(raw) {
  if (raw == null || String(raw).trim() === "") return { changed: false, next: raw };
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { changed: false, next: raw };
  }
  if (!Array.isArray(arr)) return { changed: false, next: raw };
  const set = new Set();
  let changed = false;
  for (const k of arr) {
    if (typeof k !== "string") continue;
    if (k === "admin_employees") {
      set.add("employee_manage");
      changed = true;
      continue;
    }
    set.add(k);
  }
  if (!changed) return { changed: false, next: raw };
  return { changed: true, next: JSON.stringify([...set]) };
}

async function main() {
  let usersUpdated = 0;
  let positionsUpdated = 0;
  const users = await p.user.findMany({ select: { id: true, email: true, permissions: true } });
  for (const u of users) {
    const { changed, next } = migrateKeys(u.permissions);
    if (!changed) continue;
    await p.user.update({ where: { id: u.id }, data: { permissions: next } });
    usersUpdated += 1;
    console.log("user", u.email);
  }
  const positions = await p.position.findMany({ select: { id: true, name: true, permissions: true } });
  for (const pos of positions) {
    const { changed, next } = migrateKeys(pos.permissions);
    if (!changed) continue;
    await p.position.update({ where: { id: pos.id }, data: { permissions: next } });
    positionsUpdated += 1;
    console.log("position", pos.name);
  }
  console.log(JSON.stringify({ usersUpdated, positionsUpdated }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
