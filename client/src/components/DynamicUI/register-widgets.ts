// EX1.2: Register all base widgets — runs once at startup
// @see docs/phases/phase-ex1.md

import { registerWidget } from './widget-registry';
import { TableWidget } from './widgets/TableWidget';
import { KeyValueWidget } from './widgets/KeyValueWidget';
import { BadgeGridWidget } from './widgets/BadgeGridWidget';
import { StatCardWidget } from './widgets/StatCardWidget';
import { ProgressBarWidget } from './widgets/ProgressBarWidget';
import { CodeBlockWidget } from './widgets/CodeBlockWidget';
import { AlertWidget } from './widgets/AlertWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { TreeWidget } from './widgets/TreeWidget';
import { LogViewerWidget } from './widgets/LogViewerWidget';
import { FormWidget } from './widgets/FormWidget';
import { CardListWidget } from './widgets/CardListWidget';
import { GaugeWidget } from './widgets/GaugeWidget';
import { SparklineStatWidget } from './widgets/SparklineStatWidget';

// Register base widget types (EX1.2)
registerWidget('table', TableWidget);
registerWidget('key-value', KeyValueWidget);
registerWidget('badge-grid', BadgeGridWidget);
registerWidget('stat-card', StatCardWidget);
registerWidget('progress-bar', ProgressBarWidget);
registerWidget('code-block', CodeBlockWidget);
registerWidget('alert', AlertWidget);

// Extended widgets (EX1.5)
registerWidget('chart', ChartWidget);
registerWidget('tree', TreeWidget);
registerWidget('log-viewer', LogViewerWidget);

// Form widget (EX1.15)
registerWidget('form', FormWidget);

// Card-list widget (EX3-P.6)
registerWidget('card-list', CardListWidget);

// Gauge widget (EX3-A.4)
registerWidget('gauge', GaugeWidget);

// Sparkline stat card widget (EX3-A.5)
registerWidget('sparkline-stat', SparklineStatWidget);
