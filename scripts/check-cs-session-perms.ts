async function login(email: string, password: string) {
  const body = new URLSearchParams({ email, password, callbackUrl: "/" });
  const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function check(email: string) {
  const cookie = await login(email, "Test1234!");
  const sess = await fetch("http://localhost:3000/api/auth/session", {
    headers: { Cookie: cookie },
  });
  const j = await sess.json();
  const raw = j?.user?.permissions;
  const perms = typeof raw === "string" ? JSON.parse(raw) : raw;
  console.log("---", email);
  console.log("role", j?.user?.role);
  console.log("tasks", Array.isArray(perms) && perms.includes("tasks"));
  console.log("quotations", Array.isArray(perms) && perms.includes("quotations"));
  console.log("finance_view", Array.isArray(perms) && perms.includes("finance_view"));
}

async function main() {
  await check("cs.user.test@complete.local");
  await check("cs.lead.test@complete.local");
  await check("cs.chief.test@complete.local");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
