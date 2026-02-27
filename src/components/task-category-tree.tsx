"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  FolderOpen,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { formatUserName } from "@/lib/utils";
import { CreateTaskModal } from "@/components/create-task-modal";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export type TaskCategory = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isCollapsed: boolean;
};

export type TaskInCategory = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  status?: string | null;
  priority: string;
  categoryId: string | null;
  assignedTo: { id: string; name: string; position?: string | null };
};

function buildTree(categories: TaskCategory[]): (TaskCategory & { children: (TaskCategory & { children: TaskCategory[] })[] })[] {
  const byParent = new Map<string | null, TaskCategory[]>();
  for (const c of categories) {
    const key = c.parentId ?? "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const sort = (list: TaskCategory[]) =>
    [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  function children(parentId: string | null): (TaskCategory & { children: (TaskCategory & { children: TaskCategory[] })[] })[] {
    return sort(byParent.get(parentId ?? "root") ?? []).map((c: any) => ({
      ...c,
      children: children(c.id),
    }));
  }
  return children(null);
}

function priorityVariant(p: string) {
  if (p === "HIGH") return "destructive";
  if (p === "LOW") return "secondary";
  return "outline";
}

function priorityLabel(p: string) {
  if (p === "HIGH") return "높음";
  if (p === "LOW") return "낮음";
  return "보통";
}

type Props = {
  categories: TaskCategory[];
  tasks: TaskInCategory[];
  onRefresh: () => void;
  defaultAssignedToId?: string | null;
};

export function TaskCategoryTree({
  categories,
  tasks,
  onRefresh,
  defaultAssignedToId,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategoryId, setCreateCategoryId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const tree = buildTree(categories);
  const topLevel = categories.filter((c: any) => !c.parentId).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const updateCategory = useCallback(
    async (id: string, data: { name?: string; sortOrder?: number; parentId?: string | null; isCollapsed?: boolean }) => {
      try {
        const res = await fetch(`/api/tasks/categories/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.details ?? errData.error ?? "수정 실패");
        }
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "수정에 실패했습니다.");
      }
    },
    [onRefresh]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!confirm("이 카테고리를 삭제할까요? 하위 카테고리도 삭제되며, 포함된 업무는 미분류로 이동합니다.")) return;
      try {
        const res = await fetch(`/api/tasks/categories/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.details ?? errData.error ?? "삭제 실패");
        }
        toast.success("삭제되었습니다.");
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      }
    },
    [onRefresh]
  );

  const addCategory = useCallback(
    async (parentId: string | null, name: string) => {
      if (!name.trim()) return;
      try {
        const res = await fetch("/api/tasks/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), parentId }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.details ?? errData.error ?? "추가 실패");
        }
        toast.success("카테고리가 추가되었습니다.");
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "추가에 실패했습니다.");
      }
    },
    [onRefresh]
  );

  const handleDragEnd = useCallback(
    (result: any) => {
      if (!result.destination || result.source.index === result.destination.index) return;
      const id = result.draggableId;
      if (!id) return;
      const newOrder = result.destination.index;
      const prev = topLevel.map((c: any) => c.id);
      const fromIdx = prev.indexOf(id);
      if (fromIdx === -1) return;
      const reordered = [...prev];
      reordered.splice(fromIdx, 1);
      reordered.splice(newOrder, 0, id);
      reordered.forEach((cid, idx) => updateCategory(cid, { sortOrder: idx }));
    },
    [topLevel, updateCategory]
  );

  const renderCategory = (
    cat: TaskCategory & { children: (TaskCategory & { children: TaskCategory[] })[] },
    depth: number,
    keyPrefix: string
  ) => {
    const isEditing = editingId === cat.id;
    const childTasks = tasks.filter((t: any) => t.categoryId === cat.id);
    const hasChildren = cat.children.length > 0 || childTasks.length > 0;

    return (
      <div key={cat.id} className={cn("flex flex-col", depth > 0 && "ml-4 border-l border-muted pl-2")}>
        <div
          className={cn(
            "flex items-center gap-1 py-1.5 pr-2 rounded-md group hover:bg-muted/60",
            depth === 0 && "font-medium"
          )}
        >
          <button
            type="button"
            onClick={() => updateCategory(cat.id, { isCollapsed: !cat.isCollapsed })}
            className="p-0.5 rounded hover:bg-muted"
          >
            {hasChildren ? (
              cat.isCollapsed ? (
                <ChevronRight className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )
            ) : (
              <span className="inline-block w-4" />
            )}
          </button>
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                if (editName.trim()) updateCategory(cat.id, { name: editName.trim() });
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editName.trim()) updateCategory(cat.id, { name: editName.trim() });
                  setEditingId(null);
                }
                if (e.key === "Escape") setEditingId(null);
              }}
              className="h-8 flex-1 max-w-[240px]"
              autoFocus
            />
          ) : (
            <span
              className="flex-1 truncate cursor-text py-0.5 px-1 -mx-1 rounded hover:bg-violet-50 hover:text-violet-700 border border-transparent hover:border-violet-200 transition-colors group/title flex items-center gap-1"
              onClick={() => {
                setEditingId(cat?.id ?? "");
                setEditName(cat?.name ?? "");
              }}
              title="클릭하여 이름 수정"
            >
              {cat.name}
              <Pencil className="size-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity" />
            </span>
          )}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                const name = window.prompt("하위 카테고리 이름");
                if (name != null && name.trim()) addCategory(cat.id, name.trim());
              }}
              title="하위 추가"
            >
              <FolderOpen className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                setCreateCategoryId(cat?.id ?? "");
                setCreateOpen(true);
              }}
              title="업무 추가"
            >
              <ListTodo className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={() => deleteCategory(cat.id)}
              title="삭제"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
        {!cat.isCollapsed && (
          <>
            {cat.children.map((child: any) => renderCategory(child, depth + 1, `${keyPrefix}-${child.id}`))}
            {childTasks.map((t: any) => (
              <div
                key={t.id}
                onClick={() => setDetailTaskId(t?.id ?? "")}
                className="ml-6 flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
              >
                <span className={cn("flex-1 truncate", t.isCompleted && "line-through text-muted-foreground")}>
                  {t.title}
                </span>
                <Badge variant={priorityVariant(t.priority)} className="text-[10px]">
                  {priorityLabel(t.priority)}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {format(new Date(t.dueDate), "M/d", { locale: ko })}
                </span>
                <Avatar className="size-5">
                  <AvatarFallback className="text-[10px]">
                    {(t.assignedTo.name ?? "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const uncategorizedTasks = tasks.filter((t: any) => !t.categoryId);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">대분류 (스킬트리)</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const name = window.prompt("대분류 이름");
            if (name != null && name.trim()) addCategory(null, name.trim());
          }}
        >
          <Plus className="mr-1 size-4" />
          대분류 추가
        </Button>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="top-categories">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-0">
              {topLevel.map((cat, index) => {
                const full = tree.find((c: any) => c.id === cat.id);
                if (!full) return null;
                return (
                  <Draggable key={cat.id} draggableId={cat.id} index={index}>
                    {(providedDrag) => (
                      <div ref={providedDrag.innerRef} {...providedDrag.draggableProps} className="flex items-start gap-0">
                        <div {...providedDrag.dragHandleProps} className="pt-2.5 cursor-grab active:cursor-grabbing">
                          <GripVertical className="size-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {renderCategory(full, 0, cat.id)}
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {uncategorizedTasks.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-1 py-1.5 font-medium text-muted-foreground text-sm">
            <ChevronDown className="size-4" />
            미분류 ({uncategorizedTasks.length})
          </div>
          <div className="ml-4 space-y-1">
            {uncategorizedTasks.map((t: any) => (
              <div
                key={t.id}
                onClick={() => setDetailTaskId(t?.id ?? "")}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
              >
                <span className={cn("flex-1 truncate", t.isCompleted && "line-through text-muted-foreground")}>
                  {t.title}
                </span>
                <Badge variant={priorityVariant(t.priority)} className="text-[10px]">
                  {priorityLabel(t.priority)}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {format(new Date(t.dueDate), "M/d", { locale: ko })}
                </span>
                <Avatar className="size-5">
                  <AvatarFallback className="text-[10px]">
                    {(t.assignedTo.name ?? "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              </div>
            ))}
          </div>
        </div>
      )}
      <CreateTaskModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          onRefresh();
          setCreateOpen(false);
          setCreateCategoryId(null);
        }}
        parentId={null}
        orderIndex={0}
        defaultAssignedToId={defaultAssignedToId}
        categoryId={createCategoryId}
      />
      <TaskDetailDrawer taskId={detailTaskId} onClose={() => setDetailTaskId(null)} onUpdate={onRefresh} />
    </div>
  );
}
