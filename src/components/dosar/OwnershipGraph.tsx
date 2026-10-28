import { ReactFlow, Handle, Position, type NodeProps } from "@xyflow/react";
import type { Case } from "@/types";
import { ownershipRows } from "@/lib/dataset";

function OwnerNode({ data }: NodeProps) {
  return (
    <div
      className={`w-[185px] rounded-md border bg-card px-3 py-3 text-left ${data["mismatch"] ? "border-sev-high" : "border-border"}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="text-xs font-semibold text-ink">{String(data["label"])}</div>
      <div className="mt-1 text-[10px] text-ink-muted">
        {data["company"] ? "Companie solicitantă" : "Beneficiar real"}
      </div>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}
const nodeTypes = { owner: OwnerNode };
export default function OwnershipGraph({ c }: { c: Case }) {
  const rows = ownershipRows(c);
  const nodes = [
    {
      id: "company",
      type: "owner",
      position: { x: 0, y: 70 },
      data: { label: c.company?.name ?? c.clientName, company: true },
    },
    ...rows.map((r, i) => ({
      id: r.person.id,
      type: "owner",
      position: { x: 330, y: i * 130 },
      data: { label: r.person.name, mismatch: !r.matches },
    })),
  ];
  const edges = rows.map((r) => ({
    id: `company-${r.person.id}`,
    source: "company",
    target: r.person.id,
    label: `ONRC ${r.registry === undefined ? "—" : `${r.registry}%`} · Declarat ${r.declared === undefined ? "—" : `${r.declared}%`}`,
    className: r.matches ? "ownership-match" : "ownership-mismatch",
    labelBgPadding: [5, 4] as [number, number],
    labelBgBorderRadius: 2,
  }));
  return (
    <div className="h-[250px] w-full" aria-label="Structură acționariat">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
