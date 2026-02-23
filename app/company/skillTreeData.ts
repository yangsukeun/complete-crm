import type { Node, Edge } from "@xyflow/react";
import type { SkillNodeData } from "./SkillTreeNode";

/** Initial nodes; positions are overwritten by dagre vertical layout. */
export const initialSkillNodes: Node<SkillNodeData>[] = [
  { id: "start", type: "skill", position: { x: 0, y: 0 }, data: { label: "주식회사 컴플리트 비전 2026", variant: "start" } },
  { id: "branch-sales", type: "skill", position: { x: 0, y: 0 }, data: { label: "영업/마케팅", variant: "branch" } },
  { id: "branch-crm", type: "skill", position: { x: 0, y: 0 }, data: { label: "CRM 개발", variant: "branch" } },
  { id: "branch-hr", type: "skill", position: { x: 0, y: 0 }, data: { label: "인사 관리", variant: "branch" } },
  { id: "task-s1", type: "skill", position: { x: 0, y: 0 }, data: { label: "광고 캠페인", variant: "task" } },
  { id: "task-s2", type: "skill", position: { x: 0, y: 0 }, data: { label: "고객 발굴", variant: "task" } },
  { id: "task-s3", type: "skill", position: { x: 0, y: 0 }, data: { label: "제안서 작성", variant: "task" } },
  { id: "task-c1", type: "skill", position: { x: 0, y: 0 }, data: { label: "API 설계", variant: "task" } },
  { id: "task-c2", type: "skill", position: { x: 0, y: 0 }, data: { label: "UI 개발", variant: "task" } },
  { id: "task-c3", type: "skill", position: { x: 0, y: 0 }, data: { label: "테스트", variant: "task" } },
  { id: "task-h1", type: "skill", position: { x: 0, y: 0 }, data: { label: "채용", variant: "task" } },
  { id: "task-h2", type: "skill", position: { x: 0, y: 0 }, data: { label: "교육", variant: "task" } },
  { id: "task-h3", type: "skill", position: { x: 0, y: 0 }, data: { label: "평가", variant: "task" } },
];

export const initialSkillEdges: Edge[] = [
  { id: "e-start-sales", source: "start", target: "branch-sales" },
  { id: "e-start-crm", source: "start", target: "branch-crm" },
  { id: "e-start-hr", source: "start", target: "branch-hr" },
  { id: "e-sales-s1", source: "branch-sales", target: "task-s1" },
  { id: "e-sales-s2", source: "branch-sales", target: "task-s2" },
  { id: "e-sales-s3", source: "branch-sales", target: "task-s3" },
  { id: "e-crm-c1", source: "branch-crm", target: "task-c1" },
  { id: "e-crm-c2", source: "branch-crm", target: "task-c2" },
  { id: "e-crm-c3", source: "branch-crm", target: "task-c3" },
  { id: "e-hr-h1", source: "branch-hr", target: "task-h1" },
  { id: "e-hr-h2", source: "branch-hr", target: "task-h2" },
  { id: "e-hr-h3", source: "branch-hr", target: "task-h3" },
];
