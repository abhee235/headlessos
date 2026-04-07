// EX1.5: Tree Widget — recursive collapsible tree view
// @see docs/phases/phase-ex1.md

import { useState } from 'react';
import type { z } from 'zod';
import type { TreeWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { TreeNode } from 'headlessos-shared/schemas/dynamic-view';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type TreeWidgetData = z.infer<typeof TreeWidgetSchema>;

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  defaultExpanded?: boolean;
}

function TreeNodeItem({ node, depth, defaultExpanded = true }: TreeNodeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm hover:bg-accent/50',
          'cursor-default select-none',
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
        role={hasChildren ? 'button' : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {/* Expand/collapse chevron or spacer */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Label */}
        <span className="truncate font-medium">{node.label}</span>

        {/* Value */}
        {node.value && (
          <span className="ml-auto truncate text-xs text-muted-foreground pl-2">
            {node.value}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div role="group">
          {node.children!.map((child, i) => (
            <TreeNodeItem
              key={`${child.label}-${i}`}
              node={child}
              depth={depth + 1}
              defaultExpanded={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeWidget({ widget }: { widget: TreeWidgetData }) {
  const { title, nodes } = widget;

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      )}
      <div className="rounded-md border border-border bg-card p-2 font-mono text-[13px]">
        {nodes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-1">
            No items
          </p>
        ) : (
          nodes.map((node, i) => (
            <TreeNodeItem
              key={`${node.label}-${i}`}
              node={node}
              depth={0}
              defaultExpanded
            />
          ))
        )}
      </div>
    </div>
  );
}
