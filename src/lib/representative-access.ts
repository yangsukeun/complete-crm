import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isRepresentative } from "./crm-login-landing";

export const requireRepresentative = cache(async () => {
  const id = (await getAppSession())?.user?.id;
  if (!id || !isRepresentative(id)) notFound();
  const account = await prisma.user.findUnique({ where: { id }, select: { accountDisabled: true } });
  if (!account || account.accountDisabled) notFound();
  return id;
});
