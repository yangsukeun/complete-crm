import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import { Position } from "@xyflow/react";
import type { SkillNodeData } from "./SkillTreeNode";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

export function getLayoutedNodes(
  nodes: Node<SkillNodeData>[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): Node<SkillNodeData>[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  nodes.forEach((node: any) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge: any) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node: any) => {
    const n = g.node(node.id);
    return {
      ...node,
      position: { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });
}
