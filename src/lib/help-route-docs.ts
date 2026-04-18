/** pathname → 관련 도움말 slug (FloatingHelpButton 등) */
export function helpSlugsForPathname(pathname: string): string[] {
  const p = pathname.split("?")[0] ?? pathname;
  if (p.startsWith("/tasks")) {
    return ["mindmap-three-views", "completion-filter", "mindmap-undo", "getting-started"];
  }
  if (p.startsWith("/trash")) {
    return ["trash-and-restore", "getting-started"];
  }
  if (p.startsWith("/notifications")) {
    return ["notifications-setup"];
  }
  if (p.startsWith("/ai-hub")) {
    return ["ai-hub"];
  }
  if (p.startsWith("/admin")) {
    return ["admin-user-management", "getting-started"];
  }
  if (p.startsWith("/profile")) {
    return ["notifications-setup", "faq-common-issues"];
  }
  return ["getting-started", "faq-common-issues"];
}
