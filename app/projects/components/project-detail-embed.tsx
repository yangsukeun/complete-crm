"use client";

import { ProjectDetailClient } from "../[id]/project-detail-client";

export function ProjectDetailEmbed({ projectId }: { projectId: string }) {
  return <ProjectDetailClient projectId={projectId} embed />;
}
