// EX1.5: Tree Widget — recursive collapsible tree view
// EX8.6: recessed bg-paper mono pane, 28px rows with bg-fill hover
// @see docs/phases/phase-ex1.md

import { useState } from 'react';
import type { z } from 'zod';
import type { TreeWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { TreeNode } from 'headlessos-shared/schemas/dynamic-view';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANE_CLASS, WidgetCard } from './widget-card';

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
          'flex h-7 items-center gap-1 rounded-[8px] px-1 text-[13px] transition-colors duration-150 hover:bg-fill',
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
              <ChevronDown className="h-3.5 w-3.5 text-label-3" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-label-3" />
            )
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Label */}
        <span className="truncate font-medium">{node.label}</span>

        {/* Value */}
        {node.value && (
          <span className="ml-auto truncate pl-2 text-xs text-label-3">
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
    <WidgetCard title={title}>
      <div className={cn(PANE_CLASS, 'p-1.5')}>
        {nodes.length === 0 ? (
          <p className="px-2 py-1 text-xs italic text-label-3">
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
    </WidgetCard>
  );
}
