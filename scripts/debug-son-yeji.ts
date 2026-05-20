/**
 * 연차 진단 (하위 호환). npx tsx scripts/debug-son-yeji.ts --email=user@example.com
 * 권장: npx tsx scripts/debug-leave-user.ts --email=...
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const emailFlag = process.argv.find((a) => a.startsWith("--email="));
const email = emailFlag?.split("=")[1]?.trim() ?? "complete.st20@gmail.com";
const script = path.join(__dirname, "debug-leave-user.ts");

const r = spawnSync("npx", ["tsx", script, `--email=${email}`], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(r.status === 0 ? 0 : r.status ?? 1);
