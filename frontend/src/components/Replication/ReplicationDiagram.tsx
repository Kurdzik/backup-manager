"use client"

import { useMemo } from "react"
import {
    ReactFlow,
    Background,
    Controls,
    type Edge,
    type Node,
    type NodeProps,
    Handle,
    Position,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Text } from "@mantine/core"
import { ProductIcon } from "../BrandIcons"

interface BackupSource {
    id: number
    source_type: string
    name: string
    url: string
}

interface DiagramData {
    source: BackupSource
    targets: BackupSource[]
}

interface ReplicationDiagramProps {
    data: DiagramData | null
}

const ACCENT = "#5e6ad2"
const NODE_W = 98
const NODE_H = 24

type SourceNodeData = {
    label: string
    sourceType: string
    role: "primary" | "target"
}

function SourceNode({ data }: NodeProps<Node<SourceNodeData>>) {
    const isPrimary = data.role === "primary"
    return (
        <div
            style={{
                width: NODE_W,
                minHeight: NODE_H,
                padding: "4px 6px",
                borderRadius: 3,
                border: `1px solid ${isPrimary ? ACCENT : "var(--lnr-border, #2a2a2e)"}`,
                background: isPrimary
                    ? "linear-gradient(180deg, rgba(94,106,210,0.16), rgba(94,106,210,0.06))"
                    : "rgba(255,255,255,0.02)",
                color: "var(--lnr-text, #e6e6e9)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: isPrimary
                    ? "0 0 0 1px rgba(94,106,210,0.35), 0 8px 24px -12px rgba(94,106,210,0.6)"
                    : "0 4px 12px -8px rgba(0,0,0,0.6)",
            }}
        >
            {!isPrimary && (
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ background: "transparent", border: "none", width: 1, height: 1, opacity: 0 }}
                />
            )}
            <ProductIcon type={data.sourceType} size={9} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 5,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {data.label}
                </div>
                <div
                    style={{
                        fontSize: 4,
                        color: "var(--lnr-text-faint, #8a8a95)",
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                    }}
                >
                    {isPrimary ? "Primary" : "Target"} · {data.sourceType}
                </div>
            </div>
            {isPrimary && (
                <Handle
                    type="source"
                    position={Position.Right}
                    style={{ background: "transparent", border: "none", width: 1, height: 1, opacity: 0 }}
                />
            )}
        </div>
    )
}

const nodeTypes = { source: SourceNode }

export function ReplicationDiagram({ data }: ReplicationDiagramProps) {
    const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
        if (!data) return { nodes: [], edges: [] }

        const targetCount = data.targets.length
        const targetSpacing = 34
        const targetsHeight = targetCount * targetSpacing
        const targetsStartY = -targetsHeight / 2 + targetSpacing / 2

        const primaryNode: Node = {
            id: "primary",
            type: "source",
            position: { x: 0, y: -NODE_H / 2 },
            data: {
                label: data.source.name,
                sourceType: data.source.source_type,
                role: "primary",
            },
            draggable: false,
            selectable: false,
        }

        const targetNodes: Node[] = data.targets.map((target, index) => ({
            id: `target-${target.id}`,
            type: "source",
            position: {
                x: 180,
                y: targetsStartY + index * targetSpacing - NODE_H / 2,
            },
            data: {
                label: target.name,
                sourceType: target.source_type,
                role: "target",
            },
            draggable: false,
            selectable: false,
        }))

        const edgeList: Edge[] = data.targets.map((target) => ({
            id: `edge-${target.id}`,
            source: "primary",
            target: `target-${target.id}`,
            animated: true,
            style: { stroke: ACCENT, strokeWidth: 2 },
        }))

        return { nodes: [primaryNode, ...targetNodes], edges: edgeList }
    }, [data])

    if (!data) {
        return (
            <div
                style={{
                    height: 118,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed var(--lnr-border, #2a2a2e)",
                    borderRadius: 6,
                    color: "var(--lnr-text-faint, #8a8a95)",
                }}
            >
                <Text size="sm" c="dimmed">
                    Select a replication to visualize its topology.
                </Text>
            </div>
        )
    }

    return (
        <div style={{ height: 150, width: "100%" }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1.5, minZoom: 0.2 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                zoomOnDoubleClick
                minZoom={0.2}
                maxZoom={4}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={16} size={1} color="rgba(255,255,255,0.05)" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    )
}
