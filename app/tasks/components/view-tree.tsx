"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useSWRConfig } from "swr";
import { createPortal } from "react-dom";
import "./mindmap-toolbar.css";
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Connection,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  NodeProps,
  useReactFlow,
  ReactFlowProvider,
  OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Plus,
  Check,
  X,
  GripVertical,
  Trash2,
  Settings2,
  Palette,
  ArrowUpFromLine,
  ArrowLeft,
  RotateCcw,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTaskCardAccentColor } from "@/lib/project-task-colors";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { TaskCreationSource } from "@prisma/client";
import type { MindmapShellMode } from "@/lib/mindmap-canvas-keys";
import { MINDMAP_CANVAS_ALL } from "@/lib/mindmap-canvas-keys";
import type { TaskCompletionShelf } from "@/lib/task-visibility";

// Types
type TaskData = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  status?: string | null;
  priority: string;
  parentId: string | null;
  isCollapsed: boolean;
  projectId?: string | null;
  categoryId?: string | null;
  assignees?: { id: string; name: string; position?: string | null; image?: string | null }[];
  assignedTo: { id: string; name: string; position?: string | null; image?: string | null } | null;
  /** 삭제 권한: 임원/관리자 또는 본인이 생성한 프로젝트만 */
  createdById?: string | null;
  color?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  /** 서버 계산: 완료 후 3일 경과 시 기본 접힘 */
  defaultCollapsed?: boolean;
  creationSource?: string | null;
};

type TaskLink = {
  id: string;
  parentId: string;
  childId: string;
};

export type ProjectMindmapSummary = {
  id: string;
  name: string;
  brand: { name: string };
  color: string;
  activeCount: number;
  doneCount: number;
  overdueCount: number;
};

type TreeViewProps = {
  tasks: TaskData[];
  taskLinks: TaskLink[];
  onRefresh: () => void;
  onTaskClick: (taskId: string, projectId?: string | null) => void;
  /** 호버 시 상세 라우트 prefetch (next/router) */
  onTaskHover?: (taskId: string) => void;
  onCreateTask: (parentId: string | null) => void;
  currentUserId: string;
  /** EXECUTIVE/ADMIN: 타인이 만든 프로젝트 포함 전체 삭제(소프트) 가능 */
  isTaskDeleteAdmin: boolean;
  /** 페이지 헤더 sticky 영역 DOM — 설정 시 툴바를 포털로 이동 */
  toolbarPortalEl?: HTMLElement | null;
  /** 마인드맵 3모드: 전체 조감도(Project 카드) / 프로젝트별(Task) / 미분류(Task, projectId 없음) */
  mindmapMode?: MindmapShellMode;
  /** UserTaskMindmapState.projectId (예약값 __ALL__ / __UNASSIGNED__ 또는 Project.id) */
  mindmapCanvasId?: string;
  /** 전체 조감도용 Project 집계 */
  projectSummaries?: ProjectMindmapSummary[];
  /** 프로젝트별 진입용 선택 목록 */
  projectPicker?: { id: string; name: string; brand?: { name: string } }[];
  /** URL·상태 동기화 (페이지에서 router.replace) */
  onMindmapNavigate?: (next: { mode: MindmapShellMode; projectId?: string | null }) => void;
  /** 프로젝트 뷰에서 새 Task 생성 시 projectId 로 전달 */
  contextProjectId?: string | null;
  /** 완료·아카이브 표시 범위 (목록과 동일 키로 localStorage 공유) */
  taskCompletionShelf?: TaskCompletionShelf;
  onTaskCompletionShelfChange?: (shelf: TaskCompletionShelf) => void;
  /** 마인드맵 노드 creationSource 변경(예: MINDMAP→PROJECT) — 작성자·임원/관리자 */
  canChangeTaskCreationSource?: (task: TaskData) => boolean;
};

// Style settings for tree customization
type NodeStyle = {
  nodeBgColor: string;
  nodeTextColor: string;
  fontSize: "sm" | "base" | "lg";
};

type TreeStyles = NodeStyle & {
  canvasBgColor: string;
};

const DEFAULT_NODE_STYLE: NodeStyle = {
  nodeBgColor: "bg-card",
  nodeTextColor: "text-foreground",
  fontSize: "sm",
};

const DEFAULT_TREE_STYLES: TreeStyles = {
  ...DEFAULT_NODE_STYLE,
  canvasBgColor: "#f9fafb",
};

const NODE_BG_OPTIONS = [
  { value: "bg-card", label: "기본", color: "#ffffff" },
  { value: "bg-violet-50", label: "보라", color: "#f5f3ff" },
  { value: "bg-blue-50", label: "파랑", color: "#eff6ff" },
  { value: "bg-green-50", label: "초록", color: "#f0fdf4" },
  { value: "bg-yellow-50", label: "노랑", color: "#fefce8" },
  { value: "bg-rose-50", label: "분홍", color: "#fff1f2" },
  { value: "bg-slate-100", label: "회색", color: "#f1f5f9" },
];

const TEXT_COLOR_OPTIONS = [
  { value: "text-foreground", label: "기본" },
  { value: "text-violet-700", label: "보라" },
  { value: "text-blue-700", label: "파랑" },
  { value: "text-green-700", label: "초록" },
  { value: "text-rose-700", label: "분홍" },
  { value: "text-slate-600", label: "회색" },
];

const FONT_SIZE_OPTIONS = [
  { value: "sm", label: "작게" },
  { value: "base", label: "보통" },
  { value: "lg", label: "크게" },
];

const CANVAS_BG_OPTIONS = [
  { value: "#f9fafb", label: "밝은 회색" },
  { value: "#f5f3ff", label: "연보라" },
  { value: "#eff6ff", label: "연파랑" },
  { value: "#f0fdf4", label: "연초록" },
  { value: "#fefce8", label: "연노랑" },
  { value: "#ffffff", label: "흰색" },
];

// Layout constants
const NODE_WIDTH = 280;
const NODE_HEIGHT = 100;
const PROJECT_CARD_WIDTH = 240;
const PROJECT_CARD_HEIGHT = 120;
const MINDMAP_CENTER_X = 400;
const MINDMAP_CENTER_Y = 280;
const MINDMAP_RADIUS = 280;
const MINDMAP_ANGLE_SPREAD = Math.PI * 0.85; // 약 153도 퍼짐

function mindmapPositionsStorageKey(canvasId: string) {
  return `task-mindmap-positions:${canvasId}`;
}

function loadSavedPositions(canvasId: string): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(mindmapPositionsStorageKey(canvasId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function savePosition(canvasId: string, nodeId: string, x: number, y: number) {
  const saved = loadSavedPositions(canvasId);
  saved[nodeId] = { x, y };
  try {
    localStorage.setItem(mindmapPositionsStorageKey(canvasId), JSON.stringify(saved));
  } catch {
    // ignore
  }
}

/** 마인드맵 방사형 레이아웃: 루트를 중앙에, 자식들을 부모 주변 호(arc)에 배치 */
function getMindMapLayout(
  nodes: Node[],
  edges: Edge[],
  rootIds: Set<string>
): Node[] {
  if (nodes.length === 0) return [];

  const childMap = new Map<string, string[]>();
  const primaryEdges = edges.filter((e: any) => !e.id?.startsWith("link-"));
  primaryEdges.forEach((e: any) => {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source)!.push(e.target);
  });

  const positions = new Map<string, { x: number; y: number }>();
  const nodeIds = new Set(nodes.map((n: any) => n.id));

  const getChildren = (id: string) => (childMap.get(id) ?? []).filter((c: string) => nodeIds.has(c));

  // 루트 노드들: 중앙 또는 가로로 나란히
  const roots = nodes.filter((n: any) => rootIds.has(n.id) || !primaryEdges.some((e: any) => e.target === n.id));
  if (roots.length === 0 && nodes.length > 0) {
    const first = nodes[0];
    roots.push(first);
  }

  roots.forEach((node: any, i: number) => {
    const totalRoots = roots.length;
    const dx = totalRoots > 1 ? (i - (totalRoots - 1) / 2) * (NODE_WIDTH + 80) : 0;
    positions.set(node.id, { x: MINDMAP_CENTER_X + dx - NODE_WIDTH / 2, y: MINDMAP_CENTER_Y - NODE_HEIGHT / 2 });
  });

  // BFS로 레벨별 자식들을 부모 오른쪽 호에 배치
  const queue: { id: string; level: number }[] = roots.map((n: any) => ({ id: n.id, level: 0 }));
  const visited = new Set(roots.map((n: any) => n.id));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    const children = getChildren(id);
    const parentPos = positions.get(id);
    if (!parentPos) continue;

    const radius = MINDMAP_RADIUS + level * 120;
    const startAngle = -MINDMAP_ANGLE_SPREAD / 2;
    const step = children.length > 1 ? MINDMAP_ANGLE_SPREAD / (children.length - 1) : 0;

    children.forEach((childId: string, idx: number) => {
      if (visited.has(childId)) return;
      visited.add(childId);
      const angle = startAngle + step * idx;
      const x = parentPos.x + NODE_WIDTH / 2 + radius * Math.cos(angle) - NODE_WIDTH / 2;
      const y = parentPos.y + NODE_HEIGHT / 2 + radius * Math.sin(angle) * 0.6 - NODE_HEIGHT / 2;
      positions.set(childId, { x, y });
      queue.push({ id: childId, level: level + 1 });
    });
  }

  // 위치가 없는 노드(연결만 있고 루트가 아닌 경우 등)는 중앙 근처에
  const result = nodes.map((node: any) => {
    const pos = positions.get(node.id) ?? { x: MINDMAP_CENTER_X + 50 - NODE_WIDTH / 2, y: MINDMAP_CENTER_Y - NODE_HEIGHT / 2 };
    return { ...node, position: pos };
  });

  return result;
}

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
) {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  nodes.forEach((node: any) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge: any) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node: any) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function getLayoutedProjectCards(nodes: Node[], edges: Edge[]) {
  if (nodes.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB" as const, nodesep: 40, ranksep: 48 });

  nodes.forEach((node: any) => {
    dagreGraph.setNode(node.id, { width: PROJECT_CARD_WIDTH, height: PROJECT_CARD_HEIGHT });
  });

  edges.forEach((edge: any) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node: any) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - PROJECT_CARD_WIDTH / 2,
        y: nodeWithPosition.y - PROJECT_CARD_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Status colors
function getStatusColor(status: string | null | undefined, isCompleted: boolean) {
  if (isCompleted || status === "DONE") return "bg-green-500";
  if (status === "IN_PROGRESS") return "bg-blue-500";
  return "bg-gray-400";
}

function getStatusLabel(status: string | null | undefined, isCompleted: boolean) {
  if (isCompleted || status === "DONE") return "완료";
  if (status === "IN_PROGRESS") return "진행중";
  return "할 일";
}

function getPriorityBadge(priority: string) {
  if (priority === "HIGH") return { variant: "destructive" as const, label: "높음" };
  if (priority === "LOW") return { variant: "secondary" as const, label: "낮음" };
  return { variant: "outline" as const, label: "보통" };
}

// Custom Task Node
function TaskNode({ data, id, selected }: NodeProps) {
  const {
    task,
    onToggleCollapse,
    onTitleChange,
    onAddChild,
    onAddParent,
    onTaskClick,
    onTaskHover,
    nodeStyle,
    onMindmapTaskContextMenu,
    canChangeTaskCreationSource,
  } = data as {
    task: TaskData;
    hasChildren: boolean;
    isCollapsed: boolean;
    onToggleCollapse: (id: string) => void;
    onTitleChange: (id: string, title: string) => void;
    onAddChild: (parentId: string) => void;
    onAddParent: (childId: string) => void;
    onTaskClick: (taskId: string, projectId?: string | null) => void;
    onTaskHover?: (taskId: string) => void;
    nodeStyle: NodeStyle;
    onMindmapTaskContextMenu?: (task: TaskData, clientX: number, clientY: number) => void;
    canChangeTaskCreationSource?: (task: TaskData) => boolean;
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditTitle(task.title);
  };

  const handleSave = () => {
    if (editTitle.trim() && editTitle.trim() !== task.title) {
      onTitleChange(id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(task.title);
    setIsEditing(false);
  };

  // Handle drop on this node (set as parent)
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(true);
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);

    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId || taskId === id) return;

    // Trigger parent change via custom event
    window.dispatchEvent(
      new CustomEvent("task-drop-on-node", {
        detail: { taskId, targetNodeId: id },
      })
    );
  };

  const priority = getPriorityBadge(task.priority);
  const hasChildren = data.hasChildren as boolean;
  const isCollapsed = data.isCollapsed as boolean;
  const handleNodeContextMenu = (e: MouseEvent) => {
    if (task.creationSource !== "MINDMAP") return;
    if (!canChangeTaskCreationSource?.(task) || !onMindmapTaskContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onMindmapTaskContextMenu(task, e.clientX, e.clientY);
  };

  const style = nodeStyle || DEFAULT_NODE_STYLE;
  const fontSizeClass = style.fontSize === "lg" ? "text-base" : style.fontSize === "base" ? "text-sm" : "text-xs";
  const titleFontSizeClass = style.fontSize === "lg" ? "text-lg" : style.fontSize === "base" ? "text-base" : "text-sm";

  return (
    <div
      className={cn(
        "relative rounded-lg border shadow-md transition-all hover:shadow-lg",
        style.nodeBgColor,
        style.nodeTextColor,
        "border-l-4",
        task.archivedAt != null && task.archivedAt !== ""
          ? "opacity-40 border-gray-400 dark:border-gray-500"
          : task.isCompleted && "opacity-70",
        isDropTarget && "ring-2 ring-violet-500 ring-offset-2 scale-105",
        selected && "ring-2 ring-blue-500 ring-offset-2"
      )}
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        borderLeftColor: getTaskCardAccentColor(task.color),
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={() => onTaskHover?.(task.id)}
      onContextMenu={handleNodeContextMenu}
      data-node-id={id}
    >
      {/* Top Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-violet-500 !w-3 !h-3"
      />

      {/* Content */}
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editTitle}
                  onChange={(e: any) => setEditTitle(e.target.value)}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") handleCancel();
                  }}
                  className={cn("h-7", fontSizeClass)}
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="size-6" onClick={handleSave}>
                  <Check className="size-3" />
                </Button>
                <Button size="icon" variant="ghost" className="size-6" onClick={handleCancel}>
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <p
                className={cn(
                  "font-medium line-clamp-2 cursor-pointer hover:text-violet-600",
                  titleFontSizeClass,
                  task.isCompleted && "line-through text-muted-foreground"
                )}
                onDoubleClick={handleDoubleClick}
                onClick={() => onTaskClick(task.id, task.projectId ?? null)}
              >
                {task.title}
              </p>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span
              className={cn("size-2 rounded-full", getStatusColor(task.status, task.isCompleted))}
            />
            <span className="text-xs text-muted-foreground">
              {getStatusLabel(task.status, task.isCompleted)}
            </span>
          </div>
          <Badge variant={priority.variant} className="text-[10px] px-1.5 py-0">
            {priority.label}
          </Badge>
          <TaskAssigneeAvatars assignees={task.assignees} assignedTo={task.assignedTo} size={20} />
        </div>

        {/* Actions */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onAddChild(task.id);
            }}
          >
            <Plus className="size-3 mr-1" />
            하위 추가
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onAddParent(task.id);
            }}
            title="선택 노드 위에 새 상위 프로젝트를 끼워 넣습니다"
          >
            <ArrowUpFromLine className="size-3 mr-1" />
            상위 추가
          </Button>
        </div>
      </div>

      {/* Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-violet-500 !w-3 !h-3"
      />

      {hasChildren && (
        <button
          type="button"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            onToggleCollapse(id);
          }}
          className="absolute -bottom-3 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-xs shadow-sm hover:border-blue-500 hover:text-blue-500 dark:border-muted-foreground dark:bg-card"
          title={isCollapsed ? "펼치기" : "접기"}
        >
          {isCollapsed ? "+" : "−"}
        </button>
      )}
    </div>
  );
}

function ProjectCardNode({ data, selected }: NodeProps) {
  const { summary, onOpen, tourProjectCard } = data as {
    summary: ProjectMindmapSummary;
    onOpen: () => void;
    tourProjectCard?: boolean;
  };

  return (
    <button
      type="button"
      data-tour={tourProjectCard ? "project-card" : undefined}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        "relative flex flex-col rounded-lg border-2 bg-card px-3 py-2 text-left shadow-md transition-all hover:shadow-lg",
        "border-l-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        selected && "ring-2 ring-blue-500 ring-offset-2"
      )}
      style={{
        width: PROJECT_CARD_WIDTH,
        minHeight: PROJECT_CARD_HEIGHT,
        borderLeftColor: summary.color,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="max-w-[140px] truncate px-1.5 py-0 text-[10px] font-normal">
          {summary.brand?.name ?? "브랜드"}
        </Badge>
      </div>
      <p className="line-clamp-2 flex-1 text-center text-sm font-semibold leading-tight">{summary.name}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          활성 {summary.activeCount}
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          완료 {summary.doneCount}
        </Badge>
        <Badge
          className={cn(
            "text-[10px] px-1.5 py-0 text-white",
            summary.overdueCount > 0 ? "border-0 bg-red-600 hover:bg-red-600" : "border-0 bg-muted-foreground/40"
          )}
        >
          지연 {summary.overdueCount}
        </Badge>
      </div>
    </button>
  );
}

const nodeTypes = {
  taskNode: TaskNode,
  projectCard: ProjectCardNode,
};

// Uncategorized Task Item (Draggable)
function UncategorizedTaskItem({
  task,
  onTaskClick,
  onTaskHover,
  onMindmapTaskContextMenu,
  canChangeTaskCreationSource,
}: {
  task: TaskData;
  onTaskClick: (id: string, projectId?: string | null) => void;
  onTaskHover?: (id: string) => void;
  onMindmapTaskContextMenu?: (task: TaskData, clientX: number, clientY: number) => void;
  canChangeTaskCreationSource?: (task: TaskData) => boolean;
}) {
  const priority = getPriorityBadge(task.priority);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.setData("application/json", JSON.stringify(task));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleUncategorizedContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (task.creationSource !== "MINDMAP") return;
    if (!canChangeTaskCreationSource?.(task) || !onMindmapTaskContextMenu) return;
    e.preventDefault();
    onMindmapTaskContextMenu(task, e.clientX, e.clientY);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onTaskClick(task.id, task.projectId ?? null)}
      onMouseEnter={() => onTaskHover?.(task.id)}
      onContextMenu={handleUncategorizedContextMenu}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border bg-card cursor-grab active:cursor-grabbing",
        "hover:shadow-md hover:border-violet-300 transition-all",
        "select-none"
      )}
    >
      <GripVertical className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium text-sm truncate",
          task.isCompleted && "line-through text-muted-foreground"
        )}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn("size-2 rounded-full", getStatusColor(task.status, task.isCompleted))} />
          <span className="text-xs text-muted-foreground">
            {getStatusLabel(task.status, task.isCompleted)}
          </span>
          <Badge variant={priority.variant} className="text-[10px] px-1.5 py-0">
            {priority.label}
          </Badge>
        </div>
      </div>
      <TaskAssigneeAvatars assignees={task.assignees} assignedTo={task.assignedTo} size={24} className="shrink-0" />
    </div>
  );
}

// Main Tree View (Inner)
function TreeViewInner({
  tasks,
  taskLinks,
  onRefresh,
  onTaskClick,
  onTaskHover,
  onCreateTask,
  currentUserId,
  isTaskDeleteAdmin,
  toolbarPortalEl,
  mindmapMode = "project",
  mindmapCanvasId = MINDMAP_CANVAS_ALL,
  projectSummaries = [],
  projectPicker = [],
  onMindmapNavigate,
  contextProjectId = null,
  taskCompletionShelf = "active",
  onTaskCompletionShelfChange,
  canChangeTaskCreationSource,
}: TreeViewProps) {
  const { mutate } = useSWRConfig();
  const mindmapCanvasKey = mindmapCanvasId;
  const { fitView, getNodes } = useReactFlow();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedOverrideIds, setExpandedOverrideIds] = useState<Set<string>>(new Set());
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [stagedRootIds, setStagedRootIds] = useState<Set<string>>(new Set());
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [canvasBgColor, setCanvasBgColor] = useState("#f9fafb");
  const [nodeStylesMap, setNodeStylesMap] = useState<Record<string, NodeStyle>>({});
  const [hydrationVersion, setHydrationVersion] = useState(0);
  const [mindmapRemoteLoaded, setMindmapRemoteLoaded] = useState(false);
  const [mindmapCanRevert, setMindmapCanRevert] = useState(false);
  const [mindmapReloadKey, setMindmapReloadKey] = useState(0);
  const [saveUi, setSaveUi] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isAddingParent, setIsAddingParent] = useState(false);
  const [taskContextMenu, setTaskContextMenu] = useState<{
    x: number;
    y: number;
    task: TaskData;
  } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** state보다 앞서 갱신 — 언마운트·디바운스에서 저장 누락 방지 */
  const mindmapRemoteLoadedRef = useRef(false);

  /** 디바운스 저장 시 최신 Set/Object 참조 */
  const mindmapPersistRef = useRef({
    stagedRootIds: new Set<string>(),
    collapsedIds: new Set<string>(),
    expandedOverrideIds: new Set<string>(),
    nodeStylesMap: {} as Record<string, NodeStyle>,
    canvasBgColor: "#f9fafb",
  });

  useEffect(() => {
    mindmapPersistRef.current = {
      stagedRootIds,
      collapsedIds,
      expandedOverrideIds,
      nodeStylesMap,
      canvasBgColor,
    };
  }, [stagedRootIds, collapsedIds, expandedOverrideIds, nodeStylesMap, canvasBgColor]);

  /** 캔버스(mindmapCanvasKey)별 DB 마인드맵 UI 상태 복원 */
  useEffect(() => {
    let cancelled = false;
    mindmapRemoteLoadedRef.current = false;
    setMindmapRemoteLoaded(false);
    (async () => {
      try {
        const q = new URLSearchParams();
        q.set("projectId", mindmapCanvasKey);
        const res = await fetch(`/api/mindmap?${q.toString()}`, {
          credentials: "include",
          headers: workspaceFetchHeaders(),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          setMindmapCanRevert(data.mindmapCanRevert === true);
          if (Array.isArray(data.stagedRootIds)) {
            const fromServer = data.stagedRootIds.filter((x): x is string => typeof x === "string");
            setStagedRootIds(new Set(fromServer));
          }
          if (Array.isArray(data.collapsedIds)) {
            setCollapsedIds(
              new Set(data.collapsedIds.filter((x): x is string => typeof x === "string"))
            );
          }
          if (Array.isArray(data.expandedOverrideIds)) {
            setExpandedOverrideIds(
              new Set(data.expandedOverrideIds.filter((x): x is string => typeof x === "string"))
            );
          }
          if (data.nodeStylesMap && typeof data.nodeStylesMap === "object" && !Array.isArray(data.nodeStylesMap)) {
            setNodeStylesMap(data.nodeStylesMap as Record<string, NodeStyle>);
          }
          if (typeof data.canvasBgColor === "string" && data.canvasBgColor.length <= 64) {
            setCanvasBgColor(data.canvasBgColor);
          }
          if (data.positions && typeof data.positions === "object" && !Array.isArray(data.positions)) {
            const local = loadSavedPositions(mindmapCanvasKey);
            const merged: Record<string, { x: number; y: number }> = { ...local };
            for (const [id, pos] of Object.entries(data.positions)) {
              if (!pos || typeof pos !== "object" || Array.isArray(pos)) continue;
              const x = (pos as { x?: unknown }).x;
              const y = (pos as { y?: unknown }).y;
              if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
                merged[id] = { x, y };
              }
            }
            try {
              localStorage.setItem(mindmapPositionsStorageKey(mindmapCanvasKey), JSON.stringify(merged));
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // 오프라인 등: 로컬만 사용
      } finally {
        if (!cancelled) {
          mindmapRemoteLoadedRef.current = true;
          setMindmapRemoteLoaded(true);
          setHydrationVersion((v) => v + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mindmapCanvasKey, mindmapReloadKey]);

  const handleMindmapRevert = useCallback(async () => {
    if (mindmapMode === "all") return;
    if (!window.confirm("마인드맵을 직전 저장 상태로 되돌리시겠습니까?")) return;
    try {
      const res = await fetch("/api/mindmap/revert", {
        method: "POST",
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ projectId: mindmapCanvasKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof j.error === "string" ? j.error : "되돌리기에 실패했습니다.");
        return;
      }
      toast.success("직전 저장 상태로 되돌렸습니다.");
      setMindmapCanRevert(false);
      setMindmapReloadKey((k) => k + 1);
    } catch {
      toast.error("되돌리기에 실패했습니다.");
    }
  }, [mindmapCanvasKey, mindmapMode]);

  /** defaultCollapsed 인 노드는 접힘(저장된 expandedOverrideIds 제외) */
  useEffect(() => {
    if (mindmapMode === "all") return;
    if (!mindmapRemoteLoaded) return;
    if (!tasks.length) return;
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const t of tasks) {
        if (t.defaultCollapsed && !expandedOverrideIds.has(t.id)) {
          next.add(t.id);
        }
      }
      return next;
    });
  }, [tasks, mindmapRemoteLoaded, mindmapMode, expandedOverrideIds]);

  const runMindmapPersist = useCallback(
    async (options?: { keepalive?: boolean; silent?: boolean }) => {
      if (!mindmapRemoteLoadedRef.current) return;
      const { stagedRootIds: sr, collapsedIds: ci, expandedOverrideIds: eo, nodeStylesMap: nsm, canvasBgColor: cbg } =
        mindmapPersistRef.current;
      try {
        let flowNodes: Node[] = [];
        try {
          flowNodes = getNodes();
        } catch {
          flowNodes = [];
        }
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of flowNodes) {
          positions[n.id] = { x: n.position.x, y: n.position.y };
        }
        const res = await fetch(
          `/api/mindmap?projectId=${encodeURIComponent(mindmapCanvasKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...workspaceFetchHeaders() },
            body: JSON.stringify({
              positions,
              stagedRootIds: [...sr],
              collapsedIds: [...ci],
              expandedOverrideIds: [...eo],
              nodeStylesMap: nsm,
              canvasBgColor: cbg,
            }),
            credentials: "include",
            keepalive: options?.keepalive === true,
          }
        );
        if (!res.ok) throw new Error("save failed");
        if (!options?.silent) {
          if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
          setSaveUi("saved");
          savedClearTimerRef.current = setTimeout(() => {
            savedClearTimerRef.current = null;
            setSaveUi((s) => (s === "saved" ? "idle" : s));
          }, 2000);
        }
      } catch {
        if (!options?.silent) setSaveUi("error");
      }
    },
    [getNodes, mindmapCanvasKey]
  );

  const schedulePersistMindmap = useCallback(() => {
    if (!mindmapRemoteLoadedRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    setSaveUi("saving");
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void runMindmapPersist({ silent: false });
    }, 600);
  }, [runMindmapPersist]);

  /** schedulePersistMindmap은 useReactFlow·getNodes 때문에 참조가 자주 바뀔 수 있음 — deps에 넣으면 매 렌더 effect 재실행·과도한 저장/UI 갱신 */
  const schedulePersistMindmapRef = useRef(schedulePersistMindmap);
  schedulePersistMindmapRef.current = schedulePersistMindmap;

  useEffect(() => {
    if (!mindmapRemoteLoaded) return;
    schedulePersistMindmapRef.current();
  }, [stagedRootIds, collapsedIds, expandedOverrideIds, nodeStylesMap, canvasBgColor, mindmapRemoteLoaded]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
      /* 페이지 이동 직후에도 저장되도록 디바운스 취소분을 즉시 전송 */
      if (mindmapRemoteLoadedRef.current) {
        void runMindmapPersist({ keepalive: true, silent: true });
      }
    };
  }, [runMindmapPersist]);

  /** 삭제·동기화 후 존재하지 않는 task id는 스테이징·접힘에서 제거 */
  useEffect(() => {
    if (mindmapMode === "all") return;
    if (tasks.length === 0) return;
    const ids = new Set(tasks.map((t) => t.id));
    setStagedRootIds((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
    setCollapsedIds((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
  }, [tasks, mindmapMode]);

  // Get style for a specific node
  const getNodeStyle = useCallback((nodeId: string): NodeStyle => {
    return nodeStylesMap[nodeId] || DEFAULT_NODE_STYLE;
  }, [nodeStylesMap]);

  // Update style for selected nodes
  const updateSelectedNodesStyle = useCallback((updates: Partial<NodeStyle>) => {
    if (selectedNodeIds.length === 0) {
      toast.error("먼저 스타일을 변경할 노드를 선택하세요.");
      return;
    }
    setNodeStylesMap((prev: any) => {
      const next = { ...prev };
      selectedNodeIds.forEach((id: any) => {
        next[id] = { ...(prev[id] || DEFAULT_NODE_STYLE), ...updates };
      });
      return next;
    });
    toast.success(`${selectedNodeIds.length}개 노드의 스타일이 변경되었습니다.`);
  }, [selectedNodeIds]);

  // Reset style for selected nodes
  const resetSelectedNodesStyle = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      toast.error("먼저 초기화할 노드를 선택하세요.");
      return;
    }
    setNodeStylesMap((prev: any) => {
      const next = { ...prev };
      selectedNodeIds.forEach((id: any) => {
        delete next[id];
      });
      return next;
    });
    toast.success(`${selectedNodeIds.length}개 노드의 스타일이 초기화되었습니다.`);
  }, [selectedNodeIds]);

  // Define handlers FIRST using useCallback
  const handleToggleCollapse = useCallback((id: string) => {
    const row = tasks.find((t) => t.id === id);
    const trackOverride = Boolean(row?.defaultCollapsed);
    setCollapsedIds((prev: any) => {
      const next = new Set<string>(prev);
      if (next.has(id)) {
        next.delete(id);
        if (trackOverride) {
          queueMicrotask(() => setExpandedOverrideIds((eo) => new Set([...eo, id])));
        }
      } else {
        next.add(id);
        if (trackOverride) {
          queueMicrotask(() =>
            setExpandedOverrideIds((eo) => {
              const n = new Set(eo);
              n.delete(id);
              return n;
            })
          );
        }
      }
      return next;
    });
  }, [tasks]);

  const handleTitleChange = useCallback(async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("수정 실패");
      toast.success("제목이 변경되었습니다.");
      onRefresh();
    } catch {
      toast.error("제목 변경에 실패했습니다.");
    }
  }, [onRefresh]);

  const updateTaskParent = useCallback(async (taskId: string, parentId: string | null) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      if (!res.ok) throw new Error("업데이트 실패");
      
      if (parentId) {
        toast.success("프로젝트가 하위 노드로 추가되었습니다!");
      } else {
        toast.success("프로젝트가 마인드맵에 추가되었습니다!");
      }
      onRefresh();
    } catch {
      toast.error("프로젝트 이동에 실패했습니다.");
    }
  }, [onRefresh]);

  // 접힘: 기본 parentId 트리 + 추가 연결(taskLinks)을 합친 방향 그래프의 하위 전부 숨김
  const getVisibleTasks = useCallback((allTasks: TaskData[], collapsed: Set<string>, links: TaskLink[]): TaskData[] => {
    const adj = new Map<string, string[]>();
    for (const t of allTasks) {
      if (t.parentId) {
        if (!adj.has(t.parentId)) adj.set(t.parentId, []);
        adj.get(t.parentId)!.push(t.id);
      }
    }
    for (const l of links) {
      if (!adj.has(l.parentId)) adj.set(l.parentId, []);
      const arr = adj.get(l.parentId)!;
      if (!arr.includes(l.childId)) arr.push(l.childId);
    }
    const hidden = new Set<string>();
    for (const rootId of collapsed) {
      const stack = [...(adj.get(rootId) ?? [])];
      while (stack.length) {
        const c = stack.pop()!;
        if (hidden.has(c)) continue;
        hidden.add(c);
        for (const nx of adj.get(c) ?? []) stack.push(nx);
      }
    }
    return allTasks.filter((t) => !hidden.has(t.id));
  }, []);

  // Handle selection change
  const handleSelectionChange = useCallback(({ nodes }: OnSelectionChangeParams) => {
    setSelectedNodeIds(nodes.map((n: any) => n.id));
  }, []);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const deletableSelectedIds = useMemo(() => {
    return selectedNodeIds.filter((tid) => {
      const t = taskById.get(tid);
      if (!t) return false;
      return isTaskDeleteAdmin || (!!t.createdById && t.createdById === currentUserId);
    });
  }, [selectedNodeIds, taskById, currentUserId, isTaskDeleteAdmin]);

  const deleteSelectedTasks = useCallback(async () => {
    if (deletableSelectedIds.length === 0) {
      if (selectedNodeIds.length > 0) {
        toast.error("선택한 프로젝트 중 삭제할 수 있는 항목이 없습니다. 본인이 만든 프로젝트만 삭제할 수 있습니다.");
      }
      return;
    }

    const skipped = selectedNodeIds.length - deletableSelectedIds.length;
    const confirmDelete = window.confirm(
      skipped > 0
        ? `삭제 권한이 없는 ${skipped}건을 제외하고, ${deletableSelectedIds.length}개의 프로젝트를 삭제(휴지통 이동)할까요?`
        : `선택한 ${deletableSelectedIds.length}개의 프로젝트를 삭제(휴지통 이동)할까요?`
    );
    if (!confirmDelete) return;

    try {
      for (const taskId of deletableSelectedIds) {
        const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "삭제 실패");
        }
      }
      toast.success(`${deletableSelectedIds.length}개의 프로젝트가 삭제되었습니다.`);
      setSelectedNodeIds([]);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "프로젝트 삭제에 실패했습니다.");
    }
  }, [deletableSelectedIds, selectedNodeIds.length, onRefresh]);

  // Quick create task
  const handleAddParentNode = useCallback(
    async (childId: string) => {
      const child = tasks.find((t) => t.id === childId);
      if (!child) {
        toast.error("노드를 찾을 수 없습니다.");
        return;
      }
      const fromInput = quickTitle.trim();
      const prompted =
        typeof window !== "undefined" && !fromInput
          ? window.prompt("상위 노드 제목을 입력하세요", "새 상위 프로젝트")?.trim()
          : "";
      const title = (fromInput || prompted || "새 상위 프로젝트").trim();
      if (!title) {
        toast.error("제목이 필요합니다.");
        return;
      }

      const assigneeIdsFromChild =
        child.assignees && child.assignees.length > 0
          ? [...new Set(child.assignees.map((a) => a.id).filter(Boolean))]
          : child.assignedTo?.id
            ? [child.assignedTo.id]
            : undefined;

      const createBody: Record<string, unknown> = {
        title,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        priority: "MEDIUM",
        creationSource: "MINDMAP",
      };
      if (child.parentId != null) createBody.parentId = child.parentId;
      if (child.projectId != null && child.projectId !== "") {
        createBody.projectId = child.projectId;
      }
      if (child.categoryId != null && child.categoryId !== "") {
        createBody.categoryId = child.categoryId;
      }
      if (assigneeIdsFromChild && assigneeIdsFromChild.length > 0) {
        createBody.assigneeIds = assigneeIdsFromChild;
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[mindmap] POST /api/tasks add-parent payload", structuredClone(createBody));
      }

      setIsAddingParent(true);
      try {
        const createRes = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(createBody),
        });
        if (!createRes.ok) {
          const errJson = (await createRes.json().catch(() => ({}))) as {
            error?: string;
            details?: unknown;
          };
          const detailStr =
            errJson.details && typeof errJson.details === "object"
              ? JSON.stringify(errJson.details)
              : "";
          throw new Error(
            [errJson.error ?? `HTTP ${createRes.status}`, detailStr].filter(Boolean).join(" ")
          );
        }
        const newTask = (await createRes.json()) as { id: string };

        const patchRes = await fetch(`/api/tasks/${childId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ parentId: newTask.id }),
        });
        if (!patchRes.ok) throw new Error("하위 연결 실패");

        setStagedRootIds((prev) => {
          const next = new Set(prev);
          next.delete(childId);
          if (child.parentId === null) {
            next.add(newTask.id);
          }
          return next;
        });
        if (fromInput) setQuickTitle("");
        toast.success("상위 노드가 추가되었습니다.");
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "상위 노드 추가에 실패했습니다.");
      } finally {
        setIsAddingParent(false);
      }
    },
    [tasks, quickTitle, onRefresh]
  );

  const handleQuickCreate = useCallback(async () => {
    if (!quickTitle.trim()) return;

    setIsCreating(true);
    try {
      const parentId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
      const body: Record<string, unknown> = {
        title: quickTitle.trim(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 일주일 후
        priority: "MEDIUM",
        parentId,
        creationSource: "MINDMAP",
      };
      if (contextProjectId != null && contextProjectId !== "") {
        body.projectId = contextProjectId;
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceFetchHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[TaskTreeView] quick create /api/tasks failed", {
          status: res.status,
          data,
        });
        const msg =
          (data as { error?: string; details?: string }).error ||
          (data as { error?: string; details?: string }).details ||
          `생성 실패 (HTTP ${res.status})`;
        throw new Error(msg);
      }
      toast.success(parentId ? "하위 프로젝트가 생성되었습니다!" : "새 프로젝트가 생성되었습니다!");
      setQuickTitle("");
      
      // Add new task to staged roots if no parent
      if (!parentId) {
        const newTask = await res.json();
        setStagedRootIds((prev: any) => new Set([...prev, newTask.id]));
      }
      
      onRefresh();
    } catch {
      toast.error("프로젝트 생성에 실패했습니다.");
    } finally {
      setIsCreating(false);
    }
  }, [quickTitle, selectedNodeIds, onRefresh, contextProjectId]);

  // Keyboard handler for delete key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" && deletableSelectedIds.length > 0) {
        e.preventDefault();
        deleteSelectedTasks();
      }
    },
    [deleteSelectedTasks, deletableSelectedIds.length]
  );

  const openMindmapTaskMenu = useCallback((task: TaskData, clientX: number, clientY: number) => {
    setTaskContextMenu({ x: clientX, y: clientY, task });
  }, []);

  const handlePromoteMindmapTaskToProject = useCallback(
    async (t: TaskData) => {
      setTaskContextMenu(null);
      if (!confirm(`"${t.title}"을(를) 프로젝트로 변경하시겠습니까?`)) return;
      try {
        const res = await fetch(`/api/tasks/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...workspaceFetchHeaders() },
          credentials: "include",
          body: JSON.stringify({ creationSource: TaskCreationSource.PROJECT }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(err.error ?? err.message ?? `HTTP ${res.status}`);
        }
        toast.success("프로젝트로 변경되었습니다.");
        await mutate((key) => typeof key === "string" && key.startsWith("/api/tasks"), undefined, {
          revalidate: true,
        });
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "변경에 실패했습니다.");
      }
    },
    [mutate, onRefresh]
  );

  // Split tasks: tree tasks (have parent OR have children OR staged as root OR has additional links) vs uncategorized
  const { treeTasks, uncategorizedTasks } = useMemo(() => {
    const parentIds = new Set(tasks.filter((t: any) => t.parentId).map((t: any) => t.parentId!));
    // Tasks that have additional parent links
    const linkedChildIds = new Set(taskLinks.map((l: any) => l.childId));
    const linkedParentIds = new Set(taskLinks.map((l: any) => l.parentId));
    
    const tree: TaskData[] = [];
    const uncategorized: TaskData[] = [];

    tasks.forEach((task: any) => {
      const hasParent = task.parentId !== null;
      const hasChildren = parentIds.has(task.id);
      const isStagedRoot = stagedRootIds.has(task.id);
      const hasAdditionalLinks = linkedChildIds.has(task.id) || linkedParentIds.has(task.id);
      
      if (hasParent || hasChildren || isStagedRoot || hasAdditionalLinks) {
        tree.push(task);
      } else {
        uncategorized.push(task);
      }
    });

    return { treeTasks: tree, uncategorizedTasks: uncategorized };
  }, [tasks, taskLinks, stagedRootIds]);

  const collapseAllWithChildren = useCallback(() => {
    const parentIds = new Set<string>();
    for (const t of treeTasks) {
      const hasChild =
        treeTasks.some((x) => x.parentId === t.id) || taskLinks.some((l) => l.parentId === t.id);
      if (hasChild) parentIds.add(t.id);
    }
    setCollapsedIds(parentIds);
  }, [treeTasks, taskLinks]);

  const expandAllMindmap = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  // Build nodes and edges: 전체 조감도(Project 카드) vs Task 마인드맵
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    if (mindmapMode === "all") {
      const rawNodes: Node[] = projectSummaries.map((p, idx) => ({
        id: p.id,
        type: "projectCard",
        position: { x: 0, y: 0 },
        data: {
          summary: p,
          onOpen: () => onMindmapNavigate?.({ mode: "project", projectId: p.id }),
          tourProjectCard: idx === 0,
        },
      }));
      const { nodes } = getLayoutedProjectCards(rawNodes, []);
      return { layoutedNodes: nodes, layoutedEdges: [] as Edge[] };
    }

    const visibleTasks = getVisibleTasks(treeTasks, collapsedIds, taskLinks);
    const visibleTaskIds = new Set(visibleTasks.map((t: any) => t.id));

    const nodes: Node[] = visibleTasks.map((task: any) => {
      const hasChildren = treeTasks.some((t: any) => t.parentId === task.id) ||
        taskLinks.some((l: any) => l.parentId === task.id);
      return {
        id: task.id,
        type: "taskNode",
        position: { x: 0, y: 0 },
        data: {
          task,
          hasChildren,
          isCollapsed: collapsedIds.has(task.id),
          onToggleCollapse: handleToggleCollapse,
          onTitleChange: handleTitleChange,
          onAddChild: onCreateTask,
          onAddParent: handleAddParentNode,
          onTaskClick,
          onTaskHover,
          nodeStyle: getNodeStyle(task.id),
          onMindmapTaskContextMenu: openMindmapTaskMenu,
          canChangeTaskCreationSource,
        },
      };
    });

    // Primary parent edges (solid purple)
    const primaryEdges: Edge[] = visibleTasks
      .filter((t: any) => t.parentId && visibleTaskIds.has(t.parentId))
      .map((t: any) => ({
        id: `e-${t.parentId}-${t.id}`,
        source: t.parentId!,
        target: t.id,
        type: "smoothstep",
        animated: false,
        style: { stroke: "#a78bfa", strokeWidth: 2 },
      }));

    // Additional parent edges (dashed green) - for multi-parent connections
    const additionalEdges: Edge[] = taskLinks
      .filter((l: any) => visibleTaskIds.has(l.parentId) && visibleTaskIds.has(l.childId))
      .map((l: any) => ({
        id: `link-${l.parentId}-${l.childId}`,
        source: l.parentId,
        target: l.childId,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#22c55e", strokeWidth: 2, strokeDasharray: "5,5" },
        data: { isAdditionalLink: true, linkId: l.id },
      }));

    const allEdges = [...primaryEdges, ...additionalEdges];
    // 마인드맵 방사형 레이아웃: 루트 = 상위 없는 노드 + 스테이징된 루트
    const rootIds = new Set<string>(stagedRootIds);
    visibleTasks.forEach((t: any) => {
      if (!t.parentId || !visibleTaskIds.has(t.parentId)) rootIds.add(t.id);
    });
    const mindMapNodes = getMindMapLayout(nodes, allEdges, rootIds);
    return { layoutedNodes: mindMapNodes, layoutedEdges: allEdges };
  }, [
    mindmapMode,
    projectSummaries,
    onMindmapNavigate,
    treeTasks,
    taskLinks,
    collapsedIds,
    stagedRootIds,
    onCreateTask,
    onTaskClick,
    onTaskHover,
    handleToggleCollapse,
    handleTitleChange,
    handleAddParentNode,
    getVisibleTasks,
    getNodeStyle,
    openMindmapTaskMenu,
    canChangeTaskCreationSource,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // 레이아웃 적용 + 저장된 위치 병합 (드래그로 옮긴 위치 유지) — 다음 프레임에 적용해 React DOM과 충돌 방지
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!layoutedNodes?.length && !layoutedEdges?.length) {
        setNodes([]);
        setEdges([]);
        return;
      }
      const saved = loadSavedPositions(mindmapCanvasKey);
      const merged = (layoutedNodes || []).map((node: any) => {
        const pos = saved[node.id];
        return pos ? { ...node, position: pos } : node;
      });
      setNodes(merged.length ? merged : layoutedNodes || []);
      setEdges(layoutedEdges || []);
      requestAnimationFrame(() => {
        try {
          fitView({ padding: 0.2 });
        } catch {
          // unmount 등으로 fitView 실패 시 무시
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, fitView, hydrationVersion, mindmapCanvasKey]);

  // 노드 드래그 끝났을 때 위치 저장 (자유 배치 유지) + 서버 동기화 예약
  const onNodeDragStop = useCallback(
    (_e: MouseEvent, node: Node) => {
      if (node?.position) {
        savePosition(mindmapCanvasKey, node.id, node.position.x, node.position.y);
      }
      schedulePersistMindmap();
    },
    [schedulePersistMindmap, mindmapCanvasKey]
  );

  // Listen for drop-on-node events
  useEffect(() => {
    const handleDropOnNode = async (e: Event) => {
      if (mindmapMode === "all") return;
      const { taskId, targetNodeId } = (e as CustomEvent).detail;
      
      // Remove from staged roots if it was there
      setStagedRootIds((prev: any) => {
        const next = new Set<string>(prev);
        next.delete(taskId);
        return next;
      });
      
      // Also add target to staged roots if it wasn't in tree
      setStagedRootIds((prev: any) => {
        const next = new Set<string>(prev);
        next.add(targetNodeId);
        return next;
      });
      
      await updateTaskParent(taskId, targetNodeId);
    };

    window.addEventListener("task-drop-on-node", handleDropOnNode);
    return () => window.removeEventListener("task-drop-on-node", handleDropOnNode);
  }, [updateTaskParent, mindmapMode]);

  // Handle drop on canvas (make it a root node)
  const handleCanvasDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDraggingOver(true);
  }, []);

  const handleCanvasDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleCanvasDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (mindmapMode === "all") return;

      const taskId = e.dataTransfer.getData("taskId");
      if (!taskId) return;

      const target = e.target as HTMLElement;
      const nodeElement = target.closest("[data-node-id]");
      if (nodeElement) {
        return;
      }

      setStagedRootIds((prev: any) => new Set([...prev, taskId]));
      toast.success("프로젝트가 루트 노드로 추가되었습니다! 🌱", {
        description: "다른 프로젝트를 이 노드 위에 드롭하면 하위 노드가 됩니다.",
      });
    },
    [mindmapMode]
  );

  // Create additional link between tasks
  const createTaskLink = useCallback(
    async (parentId: string, childId: string) => {
      try {
        const res = await fetch("/api/tasks/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId, childId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "연결 실패");
        }
        toast.success("추가 연결이 생성되었습니다! 🔗", {
          description: "하나의 프로젝트가 여러 대분류에 연결되었습니다.",
        });
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "연결에 실패했습니다.");
      }
    },
    [onRefresh]
  );

  // Delete additional link between tasks
  const deleteTaskLink = useCallback(
    async (parentId: string, childId: string) => {
      try {
        const res = await fetch(`/api/tasks/links?parentId=${parentId}&childId=${childId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("연결 해제 실패");
        toast.success("추가 연결이 해제되었습니다.");
        onRefresh();
      } catch {
        toast.error("연결 해제에 실패했습니다.");
      }
    },
    [onRefresh]
  );

  // Handle connection (drag edge to connect)
  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (mindmapMode === "all") return;
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      const childTask = tasks.find((t: any) => t.id === connection.target);
      const parentTask = tasks.find((t: any) => t.id === connection.source);
      
      if (!childTask || !parentTask) return;

      // Check if child already has this as primary parent
      if (childTask.parentId === connection.source) {
        toast.info("이미 기본 상위 프로젝트로 연결되어 있습니다.");
        return;
      }

      // Check if additional link already exists
      const existingLink = taskLinks.find(
        (l: any) => l.parentId === connection.source && l.childId === connection.target
      );
      if (existingLink) {
        toast.info("이미 추가 연결되어 있습니다.");
        return;
      }

      // If child has no parent, set primary parent
      if (!childTask.parentId) {
        await updateTaskParent(connection.target, connection.source);
      } else {
        // Child already has a parent, create additional link
        await createTaskLink(connection.source, connection.target);
      }
    },
    [tasks, taskLinks, updateTaskParent, createTaskLink, mindmapMode]
  );

  // Handle edge delete (disconnect parent or delete link)
  const handleEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        // Check if this is an additional link edge (starts with "link-")
        if (edge.id.startsWith("link-")) {
          // Delete the additional link
          await deleteTaskLink(edge.source, edge.target);
        } else {
          // Delete primary parent connection
          try {
            const res = await fetch(`/api/tasks/${edge.target}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ parentId: null }),
            });
            if (!res.ok) throw new Error("관계 해제 실패");
            toast.success("상위 프로젝트 연결이 해제되었습니다.");
            onRefresh();
          } catch {
            toast.error("관계 해제에 실패했습니다.");
          }
        }
      }
    },
    [onRefresh, deleteTaskLink]
  );

  const mindmapToolbar = (
    <div className="mindmap-toolbar flex w-full min-w-0 flex-col gap-2">
      <div
        className="flex w-full min-w-0 flex-wrap items-center gap-2"
        data-tour="mindmap-mode-selector"
      >
        {mindmapMode === "project" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mindmap-toolbar-btn h-8 shrink-0 gap-1 px-2"
            onClick={() => onMindmapNavigate?.({ mode: "all" })}
          >
            <ArrowLeft className="size-4" />
            조감도로
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={mindmapMode === "all" ? "default" : "outline"}
          className="mindmap-toolbar-btn h-8 px-2 text-xs"
          onClick={() => onMindmapNavigate?.({ mode: "all" })}
        >
          전체 조감도
        </Button>
        {projectPicker.length > 0 ? (
          <>
            <span className="text-muted-foreground shrink-0 text-xs">프로젝트</span>
            <Select
              value={mindmapMode === "project" && contextProjectId ? contextProjectId : undefined}
              onValueChange={(v) => onMindmapNavigate?.({ mode: "project", projectId: v })}
            >
              <SelectTrigger className="mindmap-toolbar-btn h-8 w-[min(240px,50vw)] text-xs">
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent align="start">
                {projectPicker.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.brand?.name ? `${p.brand.name} · ${p.name}` : p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={mindmapMode === "unassigned" ? "default" : "outline"}
          className="mindmap-toolbar-btn h-8 px-2 text-xs"
          onClick={() => onMindmapNavigate?.({ mode: "unassigned" })}
        >
          미분류
        </Button>
        {mindmapMode !== "all" ? (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-tour="mindmap-undo"
              className="mindmap-toolbar-btn h-8 gap-1 px-2 text-xs"
              disabled={!mindmapCanRevert}
              onClick={handleMindmapRevert}
            >
              <RotateCcw className="size-3.5" />
              되돌리기
            </Button>
          </span>
        ) : null}
      </div>

      {mindmapMode !== "all" && onTaskCompletionShelfChange ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2" data-tour="completion-toggle">
          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">완료·아카이브</span>
          <Button
            type="button"
            size="sm"
            variant={taskCompletionShelf === "active" ? "default" : "outline"}
            className="mindmap-toolbar-btn h-8 px-2 text-xs"
            onClick={() => onTaskCompletionShelfChange("active")}
          >
            활성만
          </Button>
          <Button
            type="button"
            size="sm"
            variant={taskCompletionShelf === "recent" ? "default" : "outline"}
            className="mindmap-toolbar-btn h-8 px-2 text-xs"
            onClick={() => onTaskCompletionShelfChange("recent")}
          >
            최근 완료 7일
          </Button>
          <Button
            type="button"
            size="sm"
            variant={taskCompletionShelf === "all" ? "default" : "outline"}
            className="mindmap-toolbar-btn h-8 px-2 text-xs"
            onClick={() => onTaskCompletionShelfChange("all")}
          >
            전체+아카이브
          </Button>
        </div>
      ) : null}

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        {mindmapMode !== "all" ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[100px]">
              <Input
                ref={quickInputRef}
                placeholder={
                  selectedNodeIds.length === 1 ? "하위 프로젝트 빠르게 추가..." : "새 프로젝트 빠르게 추가..."
                }
                value={quickTitle}
                onChange={(e: any) => setQuickTitle(e.target.value)}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleQuickCreate();
                  }
                }}
                className="mindmap-toolbar-input h-9 min-w-0 flex-1"
                disabled={isCreating}
              />
              <Button
                size="sm"
                className="mindmap-toolbar-btn shrink-0"
                onClick={handleQuickCreate}
                disabled={!quickTitle.trim() || isCreating}
              >
                <Plus className="mr-1 size-4" />
                추가
              </Button>
              {selectedNodeIds.length === 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mindmap-toolbar-btn shrink-0"
                  disabled={isAddingParent || isCreating}
                  onClick={() => void handleAddParentNode(selectedNodeIds[0]!)}
                  title="빠른 입력란의 제목을 쓰면 그 이름으로 상위 노드를 만듭니다. 비어 있으면 입력 창이 열립니다."
                >
                  <ArrowUpFromLine className="mr-1 size-4" />
                  상위 노드
                </Button>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mindmap-toolbar-btn h-8 px-2 text-xs"
                onClick={collapseAllWithChildren}
              >
                전체 접기
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mindmap-toolbar-btn h-8 px-2 text-xs"
                onClick={expandAllMindmap}
              >
                전체 펼치기
              </Button>
            </div>

            {selectedNodeIds.length > 0 && deletableSelectedIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="mindmap-toolbar-btn shrink-0"
                onClick={deleteSelectedTasks}
              >
                <Trash2 className="mr-1 size-4" />
                {deletableSelectedIds.length}개 삭제
                {deletableSelectedIds.length < selectedNodeIds.length ? (
                  <span className="ml-1 text-[10px] opacity-90">(권한 있는 항목만)</span>
                ) : null}
              </Button>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="mindmap-toolbar-btn shrink-0"
                  disabled={selectedNodeIds.length === 0}
                >
                  <Palette className="mr-1 size-4" />
                  스타일 {selectedNodeIds.length > 0 && `(${selectedNodeIds.length}개)`}
                </Button>
              </PopoverTrigger>
          <PopoverContent className="w-36 max-h-[min(70vh,28rem)] overflow-y-auto sm:w-40" align="end">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                선택한 {selectedNodeIds.length}개 노드에 적용됩니다.
              </p>

              <div className="space-y-2">
                <Label className="text-xs font-medium">노드 배경색</Label>
                <div className="flex gap-1 flex-wrap">
                  {NODE_BG_OPTIONS.map((opt: any) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSelectedNodesStyle({ nodeBgColor: opt.value })}
                      className={cn(
                        "size-7 rounded border-2 transition-all hover:scale-110",
                        "border-transparent hover:border-gray-400"
                      )}
                      style={{ backgroundColor: opt.color }}
                      title={opt.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">글씨 색상</Label>
                <div className="flex gap-1 flex-wrap">
                  {TEXT_COLOR_OPTIONS.map((opt: any) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSelectedNodesStyle({ nodeTextColor: opt.value })}
                      className={cn(
                        "px-2 py-1 rounded text-xs border transition-all hover:scale-105",
                        opt.value,
                        "border-transparent hover:border-gray-400 bg-white"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">글씨 크기</Label>
                <div className="flex gap-1">
                  {FONT_SIZE_OPTIONS.map((opt: any) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSelectedNodesStyle({ fontSize: opt.value as NodeStyle["fontSize"] })}
                      className={cn(
                        "px-3 py-1 rounded text-xs border transition-all hover:scale-105",
                        "border-gray-200 hover:border-violet-400 bg-white"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <hr />

              <div className="space-y-2">
                <Label className="text-xs font-medium">캔버스 배경 (전체)</Label>
                <div className="flex gap-1 flex-wrap">
                  {CANVAS_BG_OPTIONS.map((opt: any) => (
                    <button
                      key={opt.value}
                      onClick={() => setCanvasBgColor(opt.value)}
                      className={cn(
                        "size-7 rounded border-2 transition-all",
                        canvasBgColor === opt.value
                          ? "border-violet-500 scale-110"
                          : "border-transparent hover:border-gray-300"
                      )}
                      style={{ backgroundColor: opt.value }}
                      title={opt.label}
                    />
                  ))}
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={resetSelectedNodesStyle}
              >
                선택 노드 스타일 초기화
              </Button>
            </div>
          </PopoverContent>
        </Popover>
          </>
        ) : null}

        <div className="flex min-h-[1.25rem] shrink-0 items-center gap-2 text-xs">
          {saveUi === "saving" && <span className="text-muted-foreground">저장 중...</span>}
          {saveUi === "saved" && <span className="text-emerald-600">저장됨 ✓</span>}
          {saveUi === "error" && (
            <button
              type="button"
              className="text-red-600 hover:underline"
              onClick={() => schedulePersistMindmap()}
            >
              저장 실패 - 다시 시도
            </button>
          )}
        </div>

        <p className="text-muted-foreground hidden max-w-md text-xs lg:block">
          {mindmapMode === "all"
            ? "💡 프로젝트 카드를 드래그해 배치할 수 있습니다. 카드를 클릭하면 해당 프로젝트 업무 마인드맵으로 들어갑니다."
            : "💡 노드 드래그로 위치 자유 배치 · 하위/상위 추가 · 마인드맵 노드 우클릭 → 프로젝트로 변경(작성자·관리자) · 선택 후 스타일 변경 · Delete 키로 삭제(본인 작성 또는 관리자)"}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown} tabIndex={0}>
      {toolbarPortalEl
        ? createPortal(mindmapToolbar, toolbarPortalEl)
        : mindmapToolbar}

      {/* React Flow Canvas */}
      <div
        ref={reactFlowWrapper}
        className={cn(
          "h-[500px] w-full rounded-lg border-2 border-dashed transition-all",
          isDraggingOver
            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20"
            : "border-gray-200"
        )}
        style={{ backgroundColor: canvasBgColor }}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      >
        {mindmapMode === "all" && projectSummaries.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="flex max-w-sm flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <Inbox className="size-12 text-muted-foreground/60" aria-hidden />
              <div>
                <p className="font-medium text-foreground">표시할 프로젝트가 없습니다</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  워크스페이스에 연결된 프로젝트가 생기면 여기에 카드로 나타납니다.
                </p>
              </div>
            </div>
          </div>
        ) : mindmapMode !== "all" && treeTasks.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="flex max-w-sm flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <Inbox className="size-12 text-muted-foreground/60" aria-hidden />
              <div>
                <p className="font-medium text-foreground">마인드맵이 비어있습니다</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  아래 미분류 프로젝트를 여기로 드래그하여 마인드맵을 시작하세요.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
            nodesDraggable
            nodesConnectable={mindmapMode !== "all"}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={1.5}
            selectionMode={1 as any}
            selectNodesOnDrag={false}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "#a78bfa", strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#d1d5db" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={() => "#a78bfa"}
              maskColor="rgba(0, 0, 0, 0.1)"
              className="!bg-card !border"
            />
          </ReactFlow>
        )}
      </div>

      {/* Uncategorized Tasks List (전체 조감도에서는 숨김) */}
      {mindmapMode === "all" ? null : (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">
              {mindmapMode === "unassigned"
                ? "미분류 보관함 (프로젝트 연결 필요)"
                : "🌿 야생의 프로젝트 (미분류)"}
            </h3>
            <Badge variant="secondary" className="text-xs">
              {uncategorizedTasks.length}개
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {mindmapMode === "unassigned"
              ? "Task에 CRM 프로젝트를 연결하면 팀 조감도·프로젝트 뷰에서 함께 관리할 수 있습니다."
              : "드래그하여 위 캔버스에 놓으면 마인드맵에 추가할 수 있어요"}
          </p>
        </div>

        {uncategorizedTasks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <p>모든 프로젝트가 마인드맵에 배치되었습니다! 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {uncategorizedTasks.map((task: any) => (
              <UncategorizedTaskItem
                key={task.id}
                task={task}
                onTaskClick={onTaskClick}
                onTaskHover={onTaskHover}
                onMindmapTaskContextMenu={openMindmapTaskMenu}
                canChangeTaskCreationSource={canChangeTaskCreationSource}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {taskContextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100]" onMouseDown={() => setTaskContextMenu(null)}>
            <div
              role="menu"
              className="bg-popover text-popover-foreground absolute z-[101] min-w-[220px] rounded-md border p-1 shadow-md"
              style={{ left: taskContextMenu.x, top: taskContextMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="hover:bg-accent focus:bg-accent flex w-full rounded-sm px-2 py-1.5 text-left text-sm"
                onClick={() => void handlePromoteMindmapTaskToProject(taskContextMenu.task)}
              >
                프로젝트로 변경
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// Export with Provider
export function TaskTreeView(props: TreeViewProps) {
  return (
    <ReactFlowProvider>
      <TreeViewInner {...props} />
    </ReactFlowProvider>
  );
}
