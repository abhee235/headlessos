// M0.4 + M1: Fastify Server — wired with all Phase 1 services
// @see docs/phases/phase-0.md, docs/phases/phase-1.md

import 'dotenv/config';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

// Load .env from project root (one level up from server/)
dotenvConfig({ path: resolve(import.meta.dirname, "../../.env") });

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { ServiceContainer } from "./services/container.js";
import { ConnectionManager } from "./ssh/connection-manager.js";
import { CommandPolicy } from "./services/policy/command-policy.js";
import { ConfigStore } from "./config/store.js";
import { SessionStore } from "./config/session-store.js";
import { ParsingPipeline } from "./parsers/pipeline.js";
import { CommandOrchestrator } from "./orchestrator/orchestrator.js";
import { serverRoutes } from "./routes/servers.js";
import { terminalRoutes } from "./routes/terminal.js";
import { systemRoutes } from "./routes/system.js";
import { fileRoutes } from "./routes/files.js";
import { wallpaperRoutes } from "./routes/wallpapers.js";
import { glanceRoutes } from "./routes/glance.js";
import { taskManagerRoutes } from "./routes/taskmanager.js";
import { dockerRoutes } from "./routes/docker.js";
import { servicesRoutes } from "./routes/services.js";
import { serverAdminRoutes } from "./routes/serveradmin.js";
import { statsRoutes } from "./routes/stats.js";
import { llmRoutes, type KeySource } from "./routes/llm.js";
import { loadLLMSettings, saveLLMSettings, clearLLMSettings } from "./llm/llm-settings-store.js";
import { fleetRoutes } from "./routes/fleet.js";
import { sessionRoutes } from "./routes/sessions.js";
import { agentRoutes } from "./routes/agent.js";
import { agentUIRoutes } from "./routes/agent-ui.js";
import { dynamicUIRoutes } from "./routes/dynamic-ui.js";
import { containerFileRoutes } from "./routes/container-files.js";
import { allParsers } from "./parsers/deterministic/index.js";
import { OutputCache } from "./cache/output-cache.js";
import { LLMUsageTracker } from "./llm/usage-tracker.js";
import { InvestigationAgent } from "./agent/investigation-agent.js";
import { ActionAudit } from "./agent/actions/audit.js";
import { ApprovalGate } from "./agent/actions/approvals.js";
import { ActionRunner, type ServerIdentity } from "./agent/actions/runner.js";
import { actionRoutes } from "./routes/actions.js";
import { DynamicUIGenerator } from "./dynamic-ui/generator.js";
import { DynamicUIDiskCache } from "./cache/dynamic-ui-cache.js";
import { ModelRouter } from "./llm/model-router.js";
import { observatoryRoutes } from "./routes/observatory.js";
import { TraceStore } from "./observatory/trace-store.js";
import { TracePersistence } from "./observatory/trace-persistence.js";
import { initObservatory } from "./observatory/context.js";
import { AppStore } from "./dynamic-ui/app-store.js";
import { appStoreRoutes } from "./routes/app-store.js";
import { DockerService } from "./services/domain/docker-service.js";
import { SystemService } from "./services/domain/system-service.js";
import { SystemdService } from "./services/domain/systemd-service.js";
import { TaskManagerService } from "./services/domain/taskmanager-service.js";
import { FleetService } from "./services/domain/fleet-service.js";
import { FilesService } from "./services/domain/files-service.js";
import { TerminalService } from "./services/domain/terminal-service.js";
import {
  NetworkAdminService,
  FirewallAdminService,
  SecurityAdminService,
  WebServerAdminService,
  PackagesAdminService,
  CronAdminService,
  LogsAdminService,
  StorageAdminService,
} from "./services/domain/admin/index.js";

const PORT = process.env.PORT != null ? Number(process.env.PORT) : 3001;

// ── API auth token (C3) ─────────────────────────────────
// A per-install secret required on every API/WS request. Without it, the
// localhost API has no authentication, so any web page the user visits (via a
// sandboxed iframe sending `Origin: null`) could drive SSH actions on connected
// servers. The token is persisted 0600 so the Electron shell and the Vite dev
// proxy can read it and attach it; a cross-origin page cannot read the file.
const CONFIG_DIR = join(homedir(), '.headlessos');
const TOKEN_FILE = join(CONFIG_DIR, 'api-token');

function getOrCreateApiToken(): string {
  try {
    if (existsSync(TOKEN_FILE)) {
      const existing = readFileSync(TOKEN_FILE, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
  } catch { /* fall through to regenerate */ }
  const token = randomBytes(32).toString('hex');
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    chmodSync(TOKEN_FILE, 0o600);
  } catch (err) {
    console.warn('[auth] could not persist api token:', (err as Error).message);
  }
  return token;
}

async function main(): Promise<void> {
  // API auth token (C3) — created/loaded before anything else so it can be
  // printed for the Electron shell and enforced on every request.
  const apiToken = getOrCreateApiToken();

  // -- Service Container --
  const container = new ServiceContainer();

  const configStore = new ConfigStore("config");
  const sessionStore = new SessionStore("session-store");
  const commandPolicy = new CommandPolicy("command-policy");
  const connectionManager = new ConnectionManager("ssh");
  const pipeline = new ParsingPipeline("parser");
  const orchestrator = new CommandOrchestrator("orchestrator");
  const outputCache = new OutputCache();
  const usageTracker = new LLMUsageTracker();
  const traceStore = new TraceStore();
  initObservatory(traceStore);
  // EX6-D.7: Persist ended traces to disk + retention sweep (30 days / 10k cap)
  const tracePersistence = new TracePersistence("trace-persistence");
  // EX9.2: one approval gate + append-only audit for agents and view buttons
  const actionAudit = new ActionAudit();
  const approvalGate = new ApprovalGate({ audit: actionAudit });
  const describeServer = (id: string): ServerIdentity | undefined => {
    const server = configStore.findServer(id);
    return server ? { name: server.name, host: server.host, username: server.username } : undefined;
  };
  const investigationAgent = new InvestigationAgent(connectionManager, null, {
    approvals: approvalGate,
    audit: actionAudit,
    describeServer,
  });
  const diskCache = new DynamicUIDiskCache();
  await diskCache.init();
  const appStore = new AppStore();
  await appStore.init();
  const dynamicUIGenerator = new DynamicUIGenerator({
    outputCache,
    usageTracker,
    diskCache,
  });
  // Wire AppStore to TemplateRegistry so saved apps are auto-matched
  appStore.setTemplateRegistry(dynamicUIGenerator.getRegistry());

  container.register("config", configStore);
  container.register("session-store", sessionStore);
  // M12.1: Register CommandPolicy BEFORE ssh so ConnectionManager._init() can wire it.
  container.register("command-policy", commandPolicy);
  container.register("ssh", connectionManager);
  container.register("parser", pipeline);
  container.register("orchestrator", orchestrator);
  container.register("trace-persistence", tracePersistence);

  // M12.2 + M12.4 + M12.8: Domain services — thin layer over orchestrator/pipeline,
  // enforced by CommandPolicy at ConnectionManager.exec().
  const dockerService = new DockerService("docker");
  const systemService = new SystemService("system");
  const systemdService = new SystemdService("systemd");
  const taskManagerService = new TaskManagerService("taskmanager");
  const fleetService = new FleetService("fleet");
  const filesService = new FilesService("files");
  const terminalService = new TerminalService("terminal");
  const networkAdmin = new NetworkAdminService("network-admin");
  const firewallAdmin = new FirewallAdminService("firewall-admin");
  const securityAdmin = new SecurityAdminService("security-admin");
  const webServerAdmin = new WebServerAdminService("webserver-admin");
  const packagesAdmin = new PackagesAdminService("packages-admin");
  const cronAdmin = new CronAdminService("cron-admin");
  const logsAdmin = new LogsAdminService("logs-admin");
  const storageAdmin = new StorageAdminService("storage-admin");
  container.register("docker", dockerService);
  container.register("system", systemService);
  container.register("systemd", systemdService);
  container.register("taskmanager", taskManagerService);
  container.register("fleet", fleetService);
  container.register("files", filesService);
  container.register("terminal", terminalService);
  container.register("network-admin", networkAdmin);
  container.register("firewall-admin", firewallAdmin);
  container.register("security-admin", securityAdmin);
  container.register("webserver-admin", webServerAdmin);
  container.register("packages-admin", packagesAdmin);
  container.register("cron-admin", cronAdmin);
  container.register("logs-admin", logsAdmin);
  container.register("storage-admin", storageAdmin);

  // LLM provider is optional — configured if OPENAI_API_KEY is set
  let modelRouter: ModelRouter | null = null;
  // FakeSSHProxy used in fake mode to intercept SSH calls for fake-server
  let agentConnectionManager:
    | ConnectionManager
    | {
        getState: Function;
        exec: Function;
        getSftp: Function;
        connect: Function;
        disconnect: Function;
        name: string;
      } = connectionManager;

  // EX8.22: a key saved in Settings → AI (encrypted on disk) wins over .env
  const savedLLM = loadLLMSettings();
  const envKey =
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "sk-your-key-here"
      ? process.env.OPENAI_API_KEY
      : "";
  const startKey = savedLLM?.apiKey || envKey;
  const keySource: KeySource = savedLLM?.apiKey ? "settings" : envKey ? "env" : null;
  // EX9.3: the OpenAI provider is kept for switching back even while Ollama is active
  const { OpenAIProvider } = await import("./llm/providers/openai.js");
  const openaiProvider = startKey ? new OpenAIProvider(startKey, savedLLM?.model) : null;
  // EX11.2: so is the Claude provider (its key only ever comes from Settings)
  const { AnthropicProvider } = await import("./llm/providers/anthropic.js");
  const anthropicProvider = savedLLM?.anthropic?.apiKey
    ? new AnthropicProvider(savedLLM.anthropic.apiKey, savedLLM.anthropic.model)
    : null;

  if (savedLLM?.provider === "ollama" && savedLLM.ollama) {
    // ── EX9.3: a local model chosen in Settings → AI ──
    const { OllamaProvider } = await import("./llm/providers/ollama.js");
    const { probeOllamaLimits } = await import("./llm/model-limits.js");
    const { baseUrl, model, contextWindow: setting } = savedLLM.ollama;
    // EX10.1: the lowest of the owner's setting (or 64K), the Modelfile and the trained length
    const limits = await probeOllamaLimits(baseUrl, model, setting); // 8192 if Ollama is down
    const ollama = new OllamaProvider({ baseUrl, model, limits });
    pipeline.setLLMProvider(ollama);
    investigationAgent.setLLMProvider(ollama);
    dynamicUIGenerator.setLLMProvider(ollama);
    modelRouter = new ModelRouter("model-router", { apiKey: startKey, usageTracker });
    modelRouter.useProvider(ollama);
    container.register("model-router", modelRouter);
    console.log(`🦙 LLM provider: Ollama ${model} at ${baseUrl} (context ${limits.contextWindow}, ${limits.source})`);
  } else if (savedLLM?.provider === "anthropic" && anthropicProvider) {
    // ── EX11.2: Claude chosen in Settings → AI; one model serves every role, as Ollama does ──
    pipeline.setLLMProvider(anthropicProvider);
    investigationAgent.setLLMProvider(anthropicProvider);
    dynamicUIGenerator.setLLMProvider(anthropicProvider);
    modelRouter = new ModelRouter("model-router", { apiKey: startKey, usageTracker });
    modelRouter.useProvider(anthropicProvider);
    container.register("model-router", modelRouter);
    console.log(`🤖 LLM provider: Anthropic (${anthropicProvider.model}, key from Settings, encrypted)`);
  } else if (startKey) {
    const llmProvider = openaiProvider!;
    pipeline.setLLMProvider(llmProvider);
    investigationAgent.setLLMProvider(llmProvider);
    // EX8.21: set, not replaced — the AppStore is already wired to this registry
    dynamicUIGenerator.setLLMProvider(llmProvider);

    // EX2.1: Multi-Model Router
    modelRouter = new ModelRouter("model-router", {
      apiKey: startKey,
      usageTracker,
    });
    container.register("model-router", modelRouter);

    console.log(
      `🤖 LLM provider: OpenAI (${llmProvider.model}, key from ${keySource === "settings" ? "Settings, encrypted" : ".env"})`,
    );
  } else if (process.env.LLM_PROVIDER === "fake") {
    // ── FakeLLM mode — scripted responses for live UI testing ──
    const { FakeLLMProvider, createFakeModelRouter } =
      await import("./llm/providers/fake-llm.js");
    const { FakeSSHProxy, createFakeServerOutputs } =
      await import("./llm/providers/fake-ssh-proxy.js");
    const { PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO } =
      await import("./llm/providers/fake-progressive-scenario.js");

    const fakeLLM = new FakeLLMProvider(
      PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO,
      "fake-model",
      true /* looping */,
      {
        simulateDelay: true,
        delayMultiplier: 0.5, // Half-speed for snappy but visible delays
      },
    );
    modelRouter = createFakeModelRouter(fakeLLM) as unknown as ModelRouter;

    const fakeSSH = new FakeSSHProxy(
      connectionManager,
      createFakeServerOutputs(),
    );
    agentConnectionManager = fakeSSH;

    console.log(
      "🎭 LLM provider: FakeLLM (dev mode — progressive system-overview scenario)",
    );
    console.log('   Use serverId "fake-server" to test the agent pipeline');
  } else {
    console.log(
      "⚠️  No OPENAI_API_KEY set — LLM parsing disabled until a key is saved in Settings → AI",
    );
    // EX8.21: a keyless router, so a key saved in Settings → AI enables the UI Agent
    modelRouter = new ModelRouter("model-router", { apiKey: "", usageTracker });
    container.register("model-router", modelRouter);
  }

  await container.boot();
  console.log("✅ Service container booted");

  // EX6-D.7: attach trace persistence after boot (writes ended traces to disk).
  tracePersistence.attach(traceStore);
  // Run an initial sweep on boot so stale traces don't grow unbounded across restarts.
  void tracePersistence.sweep().catch(() => {
    /* best-effort */
  });

  // Seed fake-server into config store when in fake mode
  if (process.env.LLM_PROVIDER === "fake") {
    const existing = await configStore.getServer("fake-server");
    if (!existing) {
      // Push directly to the in-memory array with a fixed ID
      const fakeConfig = {
        id: "fake-server",
        name: "Fake Server (Dev)",
        host: "127.0.0.1",
        port: 2222,
        username: "testuser",
        authMethod: "password" as const,
        password: "testpass",
      };
      // Use internal push to avoid randomUUID — the save() is fine
      (configStore as any).servers.push(fakeConfig);
      console.log('   📦 Seeded "fake-server" into server list');
    }
  }

  // Register deterministic parsers
  for (const parser of allParsers) {
    pipeline.registerParser(parser);
  }
  console.log(`📋 Registered ${allParsers.length} deterministic parsers`);

  // Wire output cache and usage tracker to pipeline
  pipeline.setCache(outputCache);
  pipeline.setUsageTracker(usageTracker);
  console.log("💾 Output cache + LLM usage tracking enabled");

  // -- Fastify --
  const app = Fastify({ logger: true });

  // ── Anti-DNS-rebinding: Host-header allowlist ───────────
  // The server binds 127.0.0.1, but that alone does not stop DNS rebinding: an
  // attacker page on evil.com (rebound to 127.0.0.1) would reach us with
  // `Host: evil.com`. Legit clients (Electron → localhost:<port>, Vite dev proxy
  // with changeOrigin) always send a loopback Host. Reject anything else, and do
  // the same on the WebSocket upgrade (CORS does not apply to WS handshakes).
  const isLoopbackHost = (hostHeader: string | undefined): boolean => {
    if (!hostHeader) return false;
    // Strip port; handle IPv6 "[::1]:3001" and "host:port".
    const host = hostHeader.startsWith('[')
      ? hostHeader.slice(1, hostHeader.indexOf(']'))
      : hostHeader.split(':')[0];
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  };

  app.addHook('onRequest', async (req, reply) => {
    // Anti-DNS-rebinding: only accept loopback Host headers.
    if (!isLoopbackHost(req.headers.host)) {
      return reply.code(403).send({ error: 'Forbidden: invalid Host header' });
    }

    // CORS does not apply to WS handshakes — enforce origin here.
    if ((req.headers.upgrade ?? '').toLowerCase() === 'websocket') {
      const origin = req.headers.origin;
      const okOrigin = !origin || origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (!okOrigin) {
        return reply.code(403).send({ error: 'Forbidden: invalid WebSocket origin' });
      }
    }

    // /health is the only unauthenticated endpoint (liveness probe).
    if (req.url === '/health' || req.url.startsWith('/health?')) return;

    // Require the API token via header OR ?token= query. The query form is needed
    // for <img> and WebSocket, which cannot set headers in the browser. In dev the
    // Vite proxy injects the header; in Electron the client attaches it.
    const headerToken = req.headers['x-headlessos-token'];
    const queryToken = (req.query as { token?: string } | undefined)?.token;
    const provided = typeof headerToken === 'string' ? headerToken
      : typeof queryToken === 'string' ? queryToken
      : undefined;
    if (provided !== apiToken) {
      return reply.code(401).send({ error: 'Unauthorized: missing or invalid API token' });
    }
  });

  await app.register(cors, {
    // Allow Vite dev server and Electron production mode (file:// sends origin: null)
    origin: (origin, cb) => {
      const allowed =
        !origin || origin === "null" || /^http:\/\/localhost:\d+$/.test(origin);
      cb(null, allowed);
    },
    credentials: true,
  });

  await app.register(websocket);

  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max wallpaper
  });

  // Health check
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.get("/api/v1/status", async () => {
    return {
      version: "0.1.0",
      services: ["config", "ssh", "parser", "orchestrator"],
      llm: pipeline["llmProvider"] ? "openai" : "none",
      cache: outputCache.getStats(),
    };
  });

  // ── Auto-reconnect hook for data routes ──
  // When a server is disconnected (e.g. after dev server restart), attempt to
  // reconnect transparently using stored credentials before the route handler runs.
  const dataRoutePattern =
    /^\/api\/servers\/([^/]+)\/(docker|system|files|taskmanager|services|terminal|serveradmin|dynamic-ui|actions)/;

  app.addHook("preHandler", async (req) => {
    const match = req.url.match(dataRoutePattern);
    if (!match) return;

    const serverId = match[1]!;
    const state = connectionManager.getState(serverId);
    if (state.status === "connected") return;

    const config = await configStore.getServer(serverId);
    if (!config) return;

    // Can't auto-reconnect if the password was stripped on persist
    if (
      config.authMethod === "password" &&
      (!config.password || config.password === "***")
    ) {
      return;
    }

    try {
      await connectionManager.connect(config);
      console.log(`🔄 Auto-reconnected to server ${serverId}`);
    } catch (err) {
      // Reconnection failed — let the route handler deal with it
      console.warn(
        `⚠️  Auto-reconnect failed for ${serverId}:`,
        (err as Error).message,
      );
    }
  });

  // Register routes
  await app.register(serverRoutes, {
    connectionManager: agentConnectionManager as ConnectionManager,
    configStore,
  });
  await app.register(terminalRoutes, { terminalService });
  await app.register(systemRoutes, { systemService });
  await app.register(fileRoutes, { filesService });
  await app.register(wallpaperRoutes);
  // EX8.15: HomeHub glance — local host identity + Open-Meteo weather
  await app.register(glanceRoutes);
  await app.register(taskManagerRoutes, { taskManagerService });
  await app.register(dockerRoutes, { connectionManager, dockerService });
  await app.register(containerFileRoutes, { connectionManager });
  await app.register(servicesRoutes, { systemdService });
  await app.register(serverAdminRoutes, {
    network: networkAdmin,
    firewall: firewallAdmin,
    security: securityAdmin,
    webServer: webServerAdmin,
    packages: packagesAdmin,
    cron: cronAdmin,
    logs: logsAdmin,
    storage: storageAdmin,
  });
  await app.register(statsRoutes, { usageTracker, outputCache });
  await app.register(llmRoutes, {
    pipeline,
    keySource,
    persist: { save: (update) => saveLLMSettings(update), clear: () => clearLLMSettings() },
    // EX9.3: Ollama settings + the OpenAI key kept for switching back
    openai: openaiProvider,
    ollama: { saved: savedLLM?.ollama },
    // EX11.2: the Claude key and model kept for switching back
    anthropic: { provider: anthropicProvider },
    // EX8.21: one provider for parsing, the investigation agent and Dynamic UI;
    // a new key also re-keys the UI Agent's model router
    onChange: (provider, apiKey) => {
      investigationAgent.setLLMProvider(provider);
      dynamicUIGenerator.setLLMProvider(provider);
      // EX9.3: a local model serves every UI Agent role; OpenAI goes back to the role models
      // EX11.2: so does a Claude model
      if (modelRouter && typeof modelRouter.useProvider === "function") {
        modelRouter.useProvider(provider && provider.name !== "openai" ? provider : null);
      }
      if (apiKey !== undefined && modelRouter && typeof modelRouter.setApiKey === "function") {
        modelRouter.setApiKey(apiKey);
      }
    },
  });
  await app.register(fleetRoutes, { fleetService });
  await app.register(sessionRoutes, { sessionStore, connectionManager });
  await app.register(agentRoutes, {
    connectionManager,
    agent: investigationAgent,
    approvals: approvalGate,
  });
  // EX9.2: generated view buttons run catalog actions; changes need an approval
  await app.register(actionRoutes, {
    connectionManager,
    runner: new ActionRunner({ ssh: connectionManager, approvals: approvalGate, audit: actionAudit, describeServer }),
    approvals: approvalGate,
  });
  await app.register(dynamicUIRoutes, {
    connectionManager,
    generator: dynamicUIGenerator,
    diskCache,
  });
  await app.register(appStoreRoutes, { appStore });
  await app.register(observatoryRoutes, { traceStore });

  // UI Agent WebSocket (requires LLM)
  if (modelRouter) {
    await app.register(agentUIRoutes, {
      connectionManager: agentConnectionManager as ConnectionManager,
      modelRouter,
      templateRegistry: dynamicUIGenerator.getRegistry(),
    });
    console.log("🧙 UI Agent WebSocket enabled");
  }

  // -- Start --
  try {
    await app.listen({ port: PORT, host: "127.0.0.1" });
    const actualPort = (app.server.address() as import("net").AddressInfo).port;
    console.log(
      `🚀 HeadlessOS server running on http://localhost:${actualPort}`,
    );
    // Signal the actual port to the Electron parent process (PORT=0 gets OS-assigned)
    process.stdout.write(`HEADLESSOS_PORT:${actualPort}\n`);
    // Signal the API token so the Electron shell can attach it to API/WS calls.
    process.stdout.write(`HEADLESSOS_TOKEN:${apiToken}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // -- Graceful Shutdown --
  // EX6-A.10: Mark all sessions with live SSH connections as hibernated so the
  // frontend can wake them on next launch. Best-effort; never block exit.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n🛑 Shutting down...");

    try {
      const activeIds = connectionManager.getConnectedServerIds();
      if (activeIds.length > 0) {
        console.log(`💾 Hibernating ${activeIds.length} active session(s)...`);
        await Promise.allSettled(
          activeIds.map((id) => sessionStore.markHibernated(id)),
        );
      }
    } catch (err) {
      console.warn("[shutdown] Session hibernation error:", err);
    }

    // EX9.2: unanswered approvals resolve as deny (and are logged) before SSH goes away
    approvalGate.dispose();

    // Disconnect all SSH connections so app.close() doesn't hang on open handles
    const connectedIds = connectionManager.getConnectedServerIds();
    if (connectedIds.length > 0) {
      await Promise.allSettled(
        connectedIds.map((id) => connectionManager.disconnect(id)),
      );
    }

    await app.close();
    outputCache.destroy();
    traceStore.clear();
    await container.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
