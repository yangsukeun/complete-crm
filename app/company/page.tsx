"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SkillTreeNode, type SkillNode, type SkillNodeData } from "./SkillTreeNode";
import { initialSkillNodes, initialSkillEdges } from "./skillTreeData";
import { getLayoutedNodes } from "./layoutUtils";
import type { NodeTypes } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const nodeTypes = { skill: SkillTreeNode } as NodeTypes;

const defaultEdgeOptions = {
  style: {
    stroke: "rgb(34, 211, 238)",
    strokeWidth: 2,
    filter: "url(#edge-glow)",
  },
};

const layoutedInitialNodes = getLayoutedNodes(initialSkillNodes, initialSkillEdges, "TB");

export default function CompanySkillTreePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialSkillEdges);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<SkillNodeData>) => {
    setEditingNodeId(node.id);
    setEditLabel(node.data?.label ?? "");
    setDialogOpen(true);
  }, []);

  const handleSaveLabel = useCallback(() => {
    if (editingNodeId == null || !editLabel.trim()) return;
    setNodes((prev: any) =>
      prev.map((n: any) =>
        n.id === editingNodeId
          ? { ...n, data: { ...n.data, label: editLabel.trim() } }
          : n
      )
    );
    setDialogOpen(false);
    setEditingNodeId(null);
    setEditLabel("");
  }, [editingNodeId, editLabel, setNodes]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingNodeId(null);
      setEditLabel("");
    }
    setDialogOpen(open);
  }, []);

  return (
    <div className="h-screen w-full bg-[#0a0f1a]">
      <svg className="absolute size-0 overflow-hidden" aria-hidden>
        <defs>
          <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feFlood floodColor="rgb(34, 211, 238)" floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <div className="absolute left-4 top-4 z-10 rounded-lg border border-cyan-500/50 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
        회사 모드 · 스킬 트리 (세로)
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="[&_.react-flow__edge-path]:stroke-[2]"
      >
        <Background color="rgb(34, 211, 238)" gap={24} size={1} className="opacity-20" />
        <Controls
          className="!bg-slate-800/90 !border-slate-600 !rounded-lg [&>button]:!bg-slate-700 [&>button]:!text-cyan-300 [&>button]:!border-0 [&>button:hover]:!bg-slate-600"
          showInteractive={false}
        />
      </ReactFlow>

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="border-slate-600 bg-slate-900 text-slate-100 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
          <DialogHeader>
            <DialogTitle className="text-cyan-200">이름 수정</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="text-sm text-slate-300">노드 이름</label>
            <Input
              value={editLabel}
              onChange={(e: any) => setEditLabel(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && handleSaveLabel()}
              className="border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-500"
              placeholder="이름 입력"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleSaveLabel}
              disabled={!editLabel.trim()}
              className="bg-cyan-600 text-white hover:bg-cyan-500"
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
