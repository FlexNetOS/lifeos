// LifeOS — typed surface for the runtime data layer (Phase 4 #9).
//
// `data.js` lifts content into `window.LIFEOS_DATA` / `LIFEOS_AGGREGATORS` /
// `LIFEOS_FLOWS` as a side-effect import. This file declares the TypeScript
// shape so consumers can opt into type safety. Callers that don't care can
// still touch `window.LIFEOS_DATA` directly; this is additive.
//
// Long-term plan: port the content of `data.js` into typed ES modules under
// `src/data/<workspace>.ts`. That's deferred — sot.md mandates surgical changes,
// and the existing global is the only thing the React canon + Vue port agree on.

export type Tone = "cyan" | "purple" | "green" | "warn" | "err" | "ok" | "info" | "neutral";
export type Status = "online" | "good" | "warn" | "err" | "offline";

export interface RailEntry {
  id: string;
  icon: string;
  tooltip?: string;
  label?: string;
  badge?: { count: number; tone?: Tone };
  status?: Status;
  kind?: "profile";
}

export interface OriginTag {
  workspaceId: string;
  workspaceTitle: string;
  section: string;
}

export interface DataItem {
  icon?: string;
  label: string;
  meta?: string;
  status?: Status;
  badge?: { count?: number; tone?: Tone };
  shortcut?: string;
  view?: "n8n-flow" | "open-pencil";
  flowId?: string;
  pane?: string;
  folder?: string;
  path?: string;
  children?: DataItem[];
  _origin?: OriginTag;
  [extra: string]: unknown;
}

export interface DataSection {
  title: string;
  items: DataItem[];
  custom?: boolean;
}

export interface DataWorkspace {
  title: string;
  badge?: { count: number; tone?: Tone };
  synced?: boolean;
  sections: DataSection[];
}

export interface FlowNode {
  id: string;
  type: "trigger" | "agent" | "output";
  label: string;
  icon?: string;
  status?: Status;
  note?: string;
}

export interface Flow {
  title?: string;
  nodes: FlowNode[];
  edges: [string, string][];
}

export interface DashboardStat {
  id: string;
  icon: string;
  label: string;
  value: string;
  unit?: string;
  delta: string;
  tone?: Tone;
  meta?: string;
}

export interface DashboardTeam {
  id: string;
  icon: string;
  name: string;
  status?: Status;
  meta?: string;
  counter?: string;
  tone?: Tone;
  flowId?: string;
}

export interface DashboardCanvas {
  greeting: string;
  sub: string;
  stats: DashboardStat[];
  teams: DashboardTeam[];
  activity?: any[];
  agenda?: any[];
}

export interface LifeosData {
  rail: RailEntry[];
  railFooter: RailEntry[];
  workspaces: Record<string, DataWorkspace>;
  hubs?: Record<string, DataWorkspace>;
  profile: DataWorkspace;
  dashboardCanvas: DashboardCanvas;
  lighting?: LightingData;
  files?: FilesData;
  health?: HealthData;
  iot?: IoTData;
  contacts?: ContactsData;
  notifications?: NotificationItem[];
}

// ---------- Home → Lights subsection ----------
export type LightType = "bulb" | "lamp" | "strip" | "pendant";

export interface Light {
  id: string;
  label: string;
  type: LightType;
  isOn: boolean;
  brightness: number; // 0-100
  colorTemp?: number; // 2000-6500K
  tone?: Tone;
}

export interface LightingRoom {
  id: string;
  label: string;
  icon: string;
  activeCount: number;
  devices: Light[];
}

export interface LightingScene {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  gradient: string; // CSS gradient string or token reference
}

export interface LightingSchedule {
  id: string;
  label: string;
  time: string;
  days: string;
  sceneId: string;
  enabled: boolean;
}

export interface LightingData {
  rooms: LightingRoom[];
  scenes: LightingScene[];
  schedules: LightingSchedule[];
}

// ---------- Files subsection ----------
export type FileKind = "vue" | "md" | "json" | "png" | "pdf" | "ts" | "js" | "rs" | "toml" | "css" | "html";

export interface FileFolder {
  id: string;
  label: string;
  icon: string;
  count: number;
}

export interface FileEntry {
  id: string;
  label: string;
  path: string;
  modified: string; // relative string e.g. "2h ago"
  size: string;     // human-readable e.g. "12 KB"
  kind: FileKind;
  folderId: string;
}

export interface FilesWorkspace {
  folders: FileFolder[];
  recent: FileEntry[];
}

export interface FilesData {
  work: FilesWorkspace;
  personal: FilesWorkspace;
}

// ---------- Health subsection ----------
export interface HealthMetric {
  id: string;
  icon: string;
  label: string;
  value: string;
  unit: string;
  delta: string;
  tone?: Tone;
}

export interface SleepNight {
  day: string;
  hours: number;
  quality: number; // 0–100
}

export interface ActivityDay {
  day: string;
  move: number;     // calories
  exercise: number; // minutes
  stand: number;    // hours
}

export interface HeartSample {
  time: string; // "HH:MM"
  bpm: number;
}

export interface HealthData {
  metrics: HealthMetric[];
  sleep: SleepNight[];
  activity: ActivityDay[];
  heart: HeartSample[];
}

// ---------- Home → IoT subsection ----------
export interface IoTRoom {
  id: string;
  label: string;
  icon: string;
  online: number;
  total: number;
}

export type IoTDeviceType =
  | "tv" | "audio" | "climate" | "sensor" | "display"
  | "light" | "plug" | "control";

export interface IoTDevice {
  id: string;
  roomId: string;
  label: string;
  type: IoTDeviceType;
  online: boolean;
  latencyMs: number;
  signal: number;      // 0-100
  battery: number | null; // null = wired / no battery
  lastSeen: string;
}

export type IoTSignalKind = "primary" | "secondary";

export interface IoTSignal {
  id: string;
  label: string;
  bars: number; // 1-5
  kind: IoTSignalKind;
  meta: string;
}

export interface IoTData {
  rooms: IoTRoom[];
  devices: IoTDevice[];
  signals: IoTSignal[];
}

// ---------- Contacts subsection ----------
export interface Contact {
  id: string;
  name: string;
  role: string;
  organisation: string;
  email: string;
  phone: string;
  avatarTone: "cyan" | "purple" | "green";
  lastSeen: string;
  channel: "mail" | "phone" | "message-square";
  starred: boolean;
}

export interface ContactsData {
  work: Contact[];
  personal: Contact[];
}

// ---------- Notifications ----------
export interface NotificationLink {
  workspaceId: string;
  sectionTitle: string;
  itemLabel: string;
}

export interface NotificationItem {
  id: string;
  ts: string;        // relative timestamp, e.g. "2m ago"
  icon: string;      // kebab icon name
  tone: Tone;
  title: string;
  body: string;
  source: string;    // workspace label
  unread: boolean;
  link?: NotificationLink;
}

export type Aggregator = (this: Record<string, Aggregator>) => DataItem[];

declare global {
  interface Window {
    LIFEOS_DATA?: LifeosData;
    LIFEOS_AGGREGATORS?: Record<string, Aggregator>;
    LIFEOS_FLOWS?: Record<string, Flow>;
    TONE?: Record<string, { bg: string; fg: string; bd: string }>;
  }
}

// Typed accessor — prefer this in new TS code over reaching into `window` directly.
export function useData(): LifeosData | null {
  return (window as any).LIFEOS_DATA || null;
}

export function useFlow(flowId: string): Flow | null {
  return (window as any).LIFEOS_FLOWS?.[flowId] || null;
}

export function useAggregator(name: string): Aggregator | null {
  const a = (window as any).LIFEOS_AGGREGATORS;
  return a && typeof a[name] === "function" ? a[name] : null;
}
