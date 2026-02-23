import type { Node, Edge } from "@xyflow/react";
import type { SkillNodeData } from "../company/SkillTreeNode";

/** 개인 모드 초기 노드; 위치는 dagre 세로 레이아웃으로 덮어씀 */
export const initialSkillNodes: Node<SkillNodeData>[] = [
  { id: "start", type: "skill", position: { x: 0, y: 0 }, data: { label: "양수근의 행복한 인생", variant: "start" } },
  { id: "branch-asset", type: "skill", position: { x: 0, y: 0 }, data: { label: "💰 자산 관리", variant: "branch" } },
  { id: "branch-health", type: "skill", position: { x: 0, y: 0 }, data: { label: "💪 건강/운동", variant: "branch" } },
  { id: "branch-growth", type: "skill", position: { x: 0, y: 0 }, data: { label: "📚 자기계발", variant: "branch" } },
  { id: "task-a1", type: "skill", position: { x: 0, y: 0 }, data: { label: "주식", variant: "task" } },
  { id: "task-a2", type: "skill", position: { x: 0, y: 0 }, data: { label: "예금/적금", variant: "task" } },
  { id: "task-a3", type: "skill", position: { x: 0, y: 0 }, data: { label: "부동산", variant: "task" } },
  { id: "task-h1", type: "skill", position: { x: 0, y: 0 }, data: { label: "헬스", variant: "task" } },
  { id: "task-h2", type: "skill", position: { x: 0, y: 0 }, data: { label: "러닝", variant: "task" } },
  { id: "task-h3", type: "skill", position: { x: 0, y: 0 }, data: { label: "수면", variant: "task" } },
  { id: "task-g1", type: "skill", position: { x: 0, y: 0 }, data: { label: "독서", variant: "task" } },
  { id: "task-g2", type: "skill", position: { x: 0, y: 0 }, data: { label: "강의", variant: "task" } },
  { id: "task-g3", type: "skill", position: { x: 0, y: 0 }, data: { label: "외국어", variant: "task" } },
];

export const initialSkillEdges: Edge[] = [
  { id: "e-start-asset", source: "start", target: "branch-asset" },
  { id: "e-start-health", source: "start", target: "branch-health" },
  { id: "e-start-growth", source: "start", target: "branch-growth" },
  { id: "e-asset-a1", source: "branch-asset", target: "task-a1" },
  { id: "e-asset-a2", source: "branch-asset", target: "task-a2" },
  { id: "e-asset-a3", source: "branch-asset", target: "task-a3" },
  { id: "e-health-h1", source: "branch-health", target: "task-h1" },
  { id: "e-health-h2", source: "branch-health", target: "task-h2" },
  { id: "e-health-h3", source: "branch-health", target: "task-h3" },
  { id: "e-growth-g1", source: "branch-growth", target: "task-g1" },
  { id: "e-growth-g2", source: "branch-growth", target: "task-g2" },
  { id: "e-growth-g3", source: "branch-growth", target: "task-g3" },
];
