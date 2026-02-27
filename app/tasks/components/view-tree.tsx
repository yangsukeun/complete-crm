"use client";

import { useCallback, useEffect, useMemo, useState, useRef, DragEvent, KeyboardEvent } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Plus, ChevronDown, ChevronRight, Check, X, GripVertical, TreePine, Trash2, Settings2, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

// Types
type TaskData = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  isCompleted: boolean;
  status?: string | null;
  priority: string;
  parentId: string | null;
  isCollapsed: boolean;
  assignedTo: { id: string; name: string; position?: string | null };
};

type TaskLink = {
  id: string;
  parentId: string;
  childId: string;
};

type TreeViewProps = {
  tasks: TaskData[];
  taskLinks: TaskLink[];
  onRefresh: () => void;
  onTaskClick: (taskId: string) => void;
  onCreateTask: (parentId: string | null) => void;
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

// Dagre layout
const NODE_WIDTH = 280;
const NODE_HEIGHT = 100;

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
  const { task, onToggleCollapse, onTitleChange, onAddChild, onTaskClick, nodeStyle } = data as {
    task: TaskData;
    hasChildren: boolean;
    isCollapsed: boolean;
    onToggleCollapse: (id: string) => void;
    onTitleChange: (id: string, title: string) => void;
    onAddChild: (parentId: string) => void;
    onTaskClick: (taskId: string) => void;
    nodeStyle: NodeStyle;
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDoubleClick = (e: React.MouseEvent) => {
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
  
  const style = nodeStyle || DEFAULT_NODE_STYLE;
  const fontSizeClass = style.fontSize === "lg" ? "text-base" : style.fontSize === "base" ? "text-sm" : "text-xs";
  const titleFontSizeClass = style.fontSize === "lg" ? "text-lg" : style.fontSize === "base" ? "text-base" : "text-sm";

  return (
    <div
      className={cn(
        "relative rounded-lg border shadow-md transition-all hover:shadow-lg",
        style.nodeBgColor,
        style.nodeTextColor,
        task.isCompleted && "opacity-70",
        isDropTarget && "ring-2 ring-violet-500 ring-offset-2 scale-105",
        selected && "ring-2 ring-blue-500 ring-offset-2"
      )}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          {/* Collapse Toggle */}
          {hasChildren && (
            <button
              onClick={(e: any) => {
                e.stopPropagation();
                onToggleCollapse(id);
              }}
              className="mt-0.5 p-0.5 rounded hover:bg-muted"
            >
              {isCollapsed ? (
                <ChevronRight className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>
          )}

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
                onClick={() => onTaskClick(task.id)}
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
          <Avatar className="size-5">
            <AvatarFallback className="text-[10px]">
              {(task.assignedTo?.name ?? "?").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Actions */}
        <div className="mt-2 flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={(e: any) => {
              e.stopPropagation();
              onAddChild(task.id);
            }}
          >
            <Plus className="size-3 mr-1" />
            하위 추가
          </Button>
        </div>
      </div>

      {/* Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-violet-500 !w-3 !h-3"
      />
    </div>
  );
}

const nodeTypes = {
  taskNode: TaskNode,
};

// Uncategorized Task Item (Draggable)
function UncategorizedTaskItem({
  task,
  onTaskClick,
}: {
  task: TaskData;
  onTaskClick: (id: string) => void;
}) {
  const priority = getPriorityBadge(task.priority);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.setData("application/json", JSON.stringify(task));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onTaskClick(task.id)}
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
      <Avatar className="size-6 shrink-0">
        <AvatarFallback className="text-[10px]">
          {(task.assignedTo?.name ?? "?").slice(0, 1)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

// Main Tree View (Inner)
function TreeViewInner({ tasks, taskLinks, onRefresh, onTaskClick, onCreateTask }: TreeViewProps) {
  const { fitView } = useReactFlow();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [stagedRootIds, setStagedRootIds] = useState<Set<string>>(new Set());
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [canvasBgColor, setCanvasBgColor] = useState("#f9fafb");
  const [nodeStylesMap, setNodeStylesMap] = useState<Record<string, NodeStyle>>({});
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

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
    setCollapsedIds((prev: any) => {
      const next = new Set<string>(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
        toast.success("업무가 하위 노드로 추가되었습니다!");
      } else {
        toast.success("업무가 트리에 추가되었습니다!");
      }
      onRefresh();
    } catch {
      toast.error("업무 이동에 실패했습니다.");
    }
  }, [onRefresh]);

  // Helper function for visible tasks
  const getVisibleTasks = useCallback((allTasks: TaskData[], collapsed: Set<string>): TaskData[] => {
    const hiddenIds = new Set<string>();

    function hideChildren(parentId: string) {
      allTasks.forEach((t: any) => {
        if (t.parentId === parentId) {
          hiddenIds.add(t.id);
          hideChildren(t.id);
        }
      });
    }

    collapsed.forEach((id: any) => hideChildren(id));

    return allTasks.filter((t: any) => !hiddenIds.has(t.id));
  }, []);

  // Handle selection change
  const handleSelectionChange = useCallback(({ nodes }: OnSelectionChangeParams) => {
    setSelectedNodeIds(nodes.map((n: any) => n.id));
  }, []);

  // Delete selected tasks
  const deleteSelectedTasks = useCallback(async () => {
    if (selectedNodeIds.length === 0) return;

    const confirmDelete = window.confirm(
      `선택한 ${selectedNodeIds.length}개의 업무를 삭제하시겠습니까?`
    );
    if (!confirmDelete) return;

    try {
      for (const taskId of selectedNodeIds) {
        const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("삭제 실패");
      }
      toast.success(`${selectedNodeIds.length}개의 업무가 삭제되었습니다.`);
      setSelectedNodeIds([]);
      onRefresh();
    } catch {
      toast.error("업무 삭제에 실패했습니다.");
    }
  }, [selectedNodeIds, onRefresh]);

  // Quick create task
  const handleQuickCreate = useCallback(async () => {
    if (!quickTitle.trim()) return;

    setIsCreating(true);
    try {
      const parentId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickTitle.trim(),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 일주일 후
          priority: "MEDIUM",
          parentId,
        }),
      });
      if (!res.ok) throw new Error("생성 실패");
      toast.success(parentId ? "하위 업무가 생성되었습니다!" : "새 업무가 생성되었습니다!");
      setQuickTitle("");
      
      // Add new task to staged roots if no parent
      if (!parentId) {
        const newTask = await res.json();
        setStagedRootIds((prev: any) => new Set([...prev, newTask.id]));
      }
      
      onRefresh();
    } catch {
      toast.error("업무 생성에 실패했습니다.");
    } finally {
      setIsCreating(false);
    }
  }, [quickTitle, selectedNodeIds, onRefresh]);

  // Keyboard handler for delete key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedNodeIds.length > 0) {
        e.preventDefault();
        deleteSelectedTasks();
      }
    },
    [deleteSelectedTasks, selectedNodeIds]
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

  // Build nodes and edges from tree tasks
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    const visibleTasks = getVisibleTasks(treeTasks, collapsedIds);
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
          onTaskClick,
          nodeStyle: getNodeStyle(task.id),
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
    const result = getLayoutedElements(nodes, allEdges, "TB");
    return { layoutedNodes: result.nodes, layoutedEdges: result.edges };
  }, [treeTasks, taskLinks, collapsedIds, onCreateTask, onTaskClick, handleToggleCollapse, handleTitleChange, getVisibleTasks, getNodeStyle]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes/edges when tasks change
  useEffect(() => {
    if (layoutedNodes) {
      setNodes(layoutedNodes);
    }
    if (layoutedEdges) {
      setEdges(layoutedEdges);
    }
    if (layoutedNodes && layoutedNodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, fitView]);

  // Listen for drop-on-node events
  useEffect(() => {
    const handleDropOnNode = async (e: Event) => {
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
  }, [updateTaskParent]);

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

      const taskId = e.dataTransfer.getData("taskId");
      if (!taskId) return;

      const target = e.target as HTMLElement;
      const nodeElement = target.closest("[data-node-id]");
      if (nodeElement) {
        return;
      }

      setStagedRootIds((prev: any) => new Set([...prev, taskId]));
      toast.success("업무가 루트 노드로 추가되었습니다! 🌱", {
        description: "다른 업무를 이 노드 위에 드롭하면 하위 노드가 됩니다.",
      });
    },
    []
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
          description: "하나의 업무가 여러 대분류에 연결되었습니다.",
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
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      const childTask = tasks.find((t: any) => t.id === connection.target);
      const parentTask = tasks.find((t: any) => t.id === connection.source);
      
      if (!childTask || !parentTask) return;

      // Check if child already has this as primary parent
      if (childTask.parentId === connection.source) {
        toast.info("이미 기본 상위 업무로 연결되어 있습니다.");
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
    [tasks, taskLinks, updateTaskParent, createTaskLink]
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
            toast.success("상위 업무 연결이 해제되었습니다.");
            onRefresh();
          } catch {
            toast.error("관계 해제에 실패했습니다.");
          }
        }
      }
    },
    [onRefresh, deleteTaskLink]
  );

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Quick Create */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Input
            ref={quickInputRef}
            placeholder={selectedNodeIds.length === 1 ? "하위 업무 빠르게 추가..." : "새 업무 빠르게 추가..."}
            value={quickTitle}
            onChange={(e: any) => setQuickTitle(e.target.value)}
            onKeyDown={(e: any) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleQuickCreate();
              }
            }}
            className="h-9"
            disabled={isCreating}
          />
          <Button
            size="sm"
            onClick={handleQuickCreate}
            disabled={!quickTitle.trim() || isCreating}
          >
            <Plus className="size-4 mr-1" />
            추가
          </Button>
        </div>

        {/* Delete Selected */}
        {selectedNodeIds.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={deleteSelectedTasks}
          >
            <Trash2 className="size-4 mr-1" />
            {selectedNodeIds.length}개 삭제
          </Button>
        )}

        {/* Style Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={selectedNodeIds.length === 0}>
              <Palette className="size-4 mr-1" />
              스타일 {selectedNodeIds.length > 0 && `(${selectedNodeIds.length}개)`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
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

        <p className="text-xs text-muted-foreground hidden sm:block">
          💡 노드 선택 후 스타일 변경 가능 · Delete 키로 삭제
        </p>
      </div>

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
        {treeTasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <TreePine className="size-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-2 font-medium">트리가 비어있습니다</p>
              <p className="text-sm text-muted-foreground">
                아래 미분류 업무를 여기로 드래그하여 트리를 시작하세요 🌱
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
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

      {/* Uncategorized Tasks List */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">🌿 야생의 업무 (미분류)</h3>
            <Badge variant="secondary" className="text-xs">
              {uncategorizedTasks.length}개
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            드래그하여 위 캔버스에 놓으면 트리에 심을 수 있어요
          </p>
        </div>

        {uncategorizedTasks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <p>모든 업무가 트리에 배치되었습니다! 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {uncategorizedTasks.map((task: any) => (
              <UncategorizedTaskItem
                key={task.id}
                task={task}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        )}
      </div>
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
