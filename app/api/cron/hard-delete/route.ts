import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import { collectDriveImageFileIdsFromTaskDescription } from "@/lib/task-body-drive-images";
import { deleteFile, parseGoogleDriveFileIdFromUrl } from "@/lib/storage/google-drive-storage";

export const runtime = "nodejs";

async function purgeDriveUrls(urls: string[]) {
  const ids = new Set<string>();
  for (const u of urls) {
    const id = parseGoogleDriveFileIdFromUrl(u);
    if (id) ids.add(id);
  }
  await Promise.all([...ids].map((fid) => deleteFile(fid)));
}

/** deletedAt 이 30일 지난 항목 하드 삭제 (COMPLETE-CRM-FILES 등 Drive 정리) */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const cutoff = subDays(new Date(), 30);
  let tasksDeleted = 0;
  let projectsDeleted = 0;
  let commentsDeleted = 0;
  let attachmentsDeleted = 0;

  const cDel = await prisma.taskComment.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  commentsDeleted = cDel.count;

  const softOnlyAtts = await prisma.taskAttachment.findMany({
    where: {
      deletedAt: { lt: cutoff },
      task: { deletedAt: null },
    },
    select: { id: true, url: true, type: true },
  });
  await purgeDriveUrls(softOnlyAtts.filter((a) => a.type === "FILE").map((a) => a.url));
  if (softOnlyAtts.length) {
    const a = await prisma.taskAttachment.deleteMany({
      where: { id: { in: softOnlyAtts.map((x) => x.id) } },
    });
    attachmentsDeleted += a.count;
  }

  const doomedTasks = await prisma.task.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, description: true },
  });
  for (const t of doomedTasks) {
    for (const fid of collectDriveImageFileIdsFromTaskDescription(t.description)) {
      await deleteFile(fid);
    }
    const atts = await prisma.taskAttachment.findMany({
      where: { taskId: t.id },
      select: { url: true, type: true },
    });
    await purgeDriveUrls(atts.filter((a) => a.type === "FILE").map((a) => a.url));
    try {
      await prisma.task.delete({ where: { id: t.id } });
      tasksDeleted += 1;
    } catch (e) {
      console.warn("[hard-delete] task delete failed", t.id, e);
    }
  }

  const doomedProjects = await prisma.project.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const { id } of doomedProjects) {
    try {
      await prisma.project.delete({ where: { id } });
      projectsDeleted += 1;
    } catch (e) {
      console.warn("[hard-delete] project delete failed", id, e);
    }
  }

  console.log(
    "[hard-delete] tasks:",
    tasksDeleted,
    "projects:",
    projectsDeleted,
    "comments:",
    commentsDeleted,
    "attachments:",
    attachmentsDeleted
  );
  return NextResponse.json({
    ok: true,
    tasks: tasksDeleted,
    projects: projectsDeleted,
    comments: commentsDeleted,
    attachments: attachmentsDeleted,
  });
}
