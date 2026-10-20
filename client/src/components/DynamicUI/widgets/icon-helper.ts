// EX3-P.3: Lucide icon name → component resolver for dynamic widgets
// @see docs/phases/phase-ex3.md
//
// This uses a static map of commonly-used icons rather than importing
// the entire lucide-react bundle to keep bundle size manageable.

import type { LucideIcon } from 'lucide-react';
import {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowDownCircle,
  ArrowRightLeft, ArrowUp, ArrowUpCircle, Ban, BarChart3, Bell, Blocks, Box,
  Cable, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
  Clock, Cloud, Code, Container, Cpu, Database, Download, Edit, Eye, File,
  FileText, Filter, Folder, Globe, HardDrive, Heart, History, Home, Image,
  Info, Key, KeyRound, Layers, Link, List, Lock, Mail, Map, MapPin,
  MessageSquare, Monitor, MoreHorizontal, Network, Package, PackageCheck,
  Pencil, Play, Plug, Power, Radio, RotateCcw, RotateCw, Route, Save,
  ScrollText, Search, Server, Settings, Shield, ShieldAlert, ShieldCheck,
  Signal, Star, Square, Target, Terminal, Trash2, Upload, User, Users,
  Wifi, X, Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowDownCircle,
  ArrowRightLeft, ArrowUp, ArrowUpCircle, Ban, BarChart3, Bell, Blocks, Box,
  Cable, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
  Clock, Cloud, Code, Container, Cpu, Database, Download, Edit, Eye, File,
  FileText, Filter, Folder, Globe, HardDrive, Heart, History, Home, Image,
  Info, Key, KeyRound, Layers, Link, List, Lock, Mail, Map, MapPin,
  MessageSquare, Monitor, MoreHorizontal, Network, Package, PackageCheck,
  Pencil, Play, Plug, Power, Radio, RotateCcw, RotateCw, Route, Save,
  ScrollText, Search, Server, Settings, Shield, ShieldAlert, ShieldCheck,
  Signal, Star, Square, Target, Terminal, Trash2, Upload, User, Users,
  Wifi, X, Zap,
  // Aliases
  // HeadlessOS draws refresh as one clockwise arrow; keep the name the LLM emits
  RefreshCw: RotateCw,
  Stop: Square,
  Dns: Globe,
};

/**
 * Look up a Lucide icon component by name string (case-sensitive).
 * Returns undefined if the name is not in the static map.
 */
export function getLucideIcon(name: string): LucideIcon | undefined {
  return ICON_MAP[name];
}
