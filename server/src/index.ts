// M0.4 + M1: Fastify Server — wired with all Phase 1 services
// @see docs/phases/phase-0.md, docs/phases/phase-1.md

import 'dotenv/config';
import { resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

// Load .env from project root (one level up from server/)
dotenvConfig({ path: resolve(import.meta.dirname, '../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { ServiceContainer } from './services/container.js';
import { ConnectionManager } from './ssh/connection-manager.js';
import { ConfigStore } from './config/store.js';
import { SessionStore } from './config/session-store.js';
import { ParsingPipeline } from './parsers/pipeline.js';
import { CommandOrchestrator } from './orchestrator/orchestrator.js';
import { serverRoutes } from './routes/servers.js';
import { terminalRoutes } from './routes/terminal.js';
import { systemRoutes } from './routes/system.js';
import { fileRoutes } from './routes/files.js';
import { wallpaperRoutes } from './routes/wallpapers.js';
import { taskManagerRoutes } from './routes/taskmanager.js';
import { dockerRoutes } from './routes/docker.js';
import { servicesRoutes } from './routes/services.js';
import { serverAdminRoutes } from './routes/serveradmin.js';
import { statsRoutes } from './routes/stats.js';
import { llmRoutes } from './routes/llm.js';
import { fleetRoutes } from './routes/fleet.js';
import { sessionRoutes } from './routes/sessions.js';
import { agentRoutes } from './routes/agent.js';
import { agentUIRoutes } from './routes/agent-ui.js';
import { dynamicUIRoutes } from './routes/dynamic-ui.js';
import { allParsers } from './parsers/deterministic/index.js';
import { OutputCache } from './cache/output-cache.js';
import { LLMUsageTracker } from './llm/usage-tracker.js';
import { InvestigationAgent } from './agent/investigation-agent.js';
import { DynamicUIGenerator } from './dynamic-ui/generator.js';
import { DynamicUIDiskCache } from './cache/dynamic-ui-cache.js';
import { ModelRouter } from './llm/model-router.js';
import { observatoryRoutes } from './routes/observatory.js';
import { TraceStore } from './observatory/trace-store.js';
import { TracePersistence } from './observatory/trace-persistence.js';
import { initObservatory } from './observatory/context.js';
import { AppStore } from './dynamic-ui/app-store.js';
import { appStoreRoutes } from './routes/app-store.js';

const PORT = process.env.PORT != null ? Number(process.env.PORT) : 3001;

async function main(): Promise<void> {
  // -- Service Container --
  const container = new ServiceContainer();

  const configStore = new ConfigStore('config');
  const sessionStore = new SessionStore('session-store');
  const connectionManager = new ConnectionManager('ssh');
  const pipeline = new ParsingPipeline('parser');
  const orchestrator = new CommandOrchestrator('orchestrator');
  const outputCache = new OutputCache();
  const usageTracker = new LLMUsageTracker();
  const traceStore = new TraceStore();
  initObservatory(traceStore);
  // EX6-D.7: Persist ended traces to disk + retention sweep (30 days / 10k cap)
  const tracePersistence = new TracePersistence('trace-persistence');
  const investigationAgent = new InvestigationAgent(connectionManager, null);
  const diskCache = new DynamicUIDiskCache();
  await diskCache.init();
  const appStore = new AppStore();
  await appStore.init();
  let dynamicUIGenerator = new DynamicUIGenerator({ outputCache, usageTracker, diskCache });
  // Wire AppStore to TemplateRegistry so saved apps are auto-matched
  appStore.setTemplateRegistry(dynamicUIGenerator.getRegistry());

  container.register('config', configStore);
  container.register('session-store', sessionStore);
  container.register('ssh', connectionManager);
  container.register('parser', pipeline);
  container.register('orchestrator', orchestrator);
  container.register('trace-persistence', tracePersistence);

  // LLM provider is optional — configured if OPENAI_API_KEY is set
  let modelRouter: ModelRouter | null = null;
  // FakeSSHProxy used in fake mode to intercept SSH calls for fake-server
  let agentConnectionManager: ConnectionManager | { getState: Function; exec: Function; getSftp: Function; connect: Function; disconnect: Function; name: string } = connectionManager;

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-key-here') {
    const { OpenAIProvider } = await import('./llm/providers/openai.js');
    const llmProvider = new OpenAIProvider(process.env.OPENAI_API_KEY);
    pipeline.setLLMProvider(llmProvider);
    investigationAgent.setLLMProvider(llmProvider);
    dynamicUIGenerator = new DynamicUIGenerator({ llmProvider, outputCache, usageTracker, diskCache });

    // EX2.1: Multi-Model Router
    modelRouter = new ModelRouter('model-router', {
      apiKey: process.env.OPENAI_API_KEY,
      usageTracker,
    });
    container.register('model-router', modelRouter);

    console.log('🤖 LLM provider: OpenAI');
  } else if (process.env.LLM_PROVIDER === 'fake') {
    // ── FakeLLM mode — scripted responses for live UI testing ──
    const { FakeLLMProvider, createFakeModelRouter } = await import('./llm/providers/fake-llm.js');
    const { FakeSSHProxy, createFakeServerOutputs } = await import('./llm/providers/fake-ssh-proxy.js');
    const { PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO } = await import('./llm/providers/fake-progressive-scenario.js');

    const fakeLLM = new FakeLLMProvider(PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO, 'fake-model', true /* looping */, {
      simulateDelay: true,
      delayMultiplier: 0.5, // Half-speed for snappy but visible delays
    });
    modelRouter = createFakeModelRouter(fakeLLM) as unknown as ModelRouter;

    const fakeSSH = new FakeSSHProxy(connectionManager, createFakeServerOutputs());
    agentConnectionManager = fakeSSH;

    console.log('🎭 LLM provider: FakeLLM (dev mode — progressive system-overview scenario)');
    console.log('   Use serverId "fake-server" to test the agent pipeline');
  } else {
    console.log('⚠️  No OPENAI_API_KEY set — LLM parsing disabled (deterministic parsers only)');
  }

  await container.boot();
  console.log('✅ Service container booted');

  // EX6-D.7: attach trace persistence after boot (writes ended traces to disk).
  tracePersistence.attach(traceStore);
  // Run an initial sweep on boot so stale traces don't grow unbounded across restarts.
  void tracePersistence.sweep().catch(() => { /* best-effort */ });

  // Seed fake-server into config store when in fake mode
  if (process.env.LLM_PROVIDER === 'fake') {
    const existing = await configStore.getServer('fake-server');
    if (!existing) {
      // Push directly to the in-memory array with a fixed ID
      const fakeConfig = {
        id: 'fake-server',
        name: 'Fake Server (Dev)',
        host: '127.0.0.1',
        port: 2222,
        username: 'testuser',
        authMethod: 'password' as const,
        password: 'testpass',
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
  console.log('💾 Output cache + LLM usage tracking enabled');

  // -- Fastify --
  const app = Fastify({ logger: true });

  await app.register(cors, {
    // Allow Vite dev server and Electron production mode (file:// sends origin: null)
    origin: (origin, cb) => {
      const allowed = !origin || origin === 'null' || /^http:\/\/localhost:\d+$/.test(origin);
      cb(null, allowed);
    },
    credentials: true,
  });

  await app.register(websocket);

  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max wallpaper
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/api/v1/status', async () => {
    return {
      version: '0.1.0',
      services: ['config', 'ssh', 'parser', 'orchestrator'],
      llm: pipeline['llmProvider'] ? 'openai' : 'none',
      cache: outputCache.getStats(),
    };
  });

  // ── Auto-reconnect hook for data routes ──
  // When a server is disconnected (e.g. after dev server restart), attempt to
  // reconnect transparently using stored credentials before the route handler runs.
  const dataRoutePattern = /^\/api\/servers\/([^/]+)\/(docker|system|files|taskmanager|services|terminal|serveradmin|dynamic-ui)/;

  app.addHook('preHandler', async (req) => {
    const match = req.url.match(dataRoutePattern);
    if (!match) return;

    const serverId = match[1]!;
    const state = connectionManager.getState(serverId);
    if (state.status === 'connected') return;

    const config = await configStore.getServer(serverId);
    if (!config) return;

    // Can't auto-reconnect if the password was stripped on persist
    if (config.authMethod === 'password' && (!config.password || config.password === '***')) {
      return;
    }

    try {
      await connectionManager.connect(config);
      console.log(`🔄 Auto-reconnected to server ${serverId}`);
    } catch (err) {
      // Reconnection failed — let the route handler deal with it
      console.warn(`⚠️  Auto-reconnect failed for ${serverId}:`, (err as Error).message);
    }
  });

  // Register routes
  await app.register(serverRoutes, { connectionManager: agentConnectionManager as ConnectionManager, configStore });
  await app.register(terminalRoutes, { connectionManager });
  await app.register(systemRoutes, { orchestrator, connectionManager });
  await app.register(fileRoutes, { connectionManager });
  await app.register(wallpaperRoutes);
  await app.register(taskManagerRoutes, { orchestrator, connectionManager });
  await app.register(dockerRoutes, { connectionManager });
  await app.register(servicesRoutes, { connectionManager });
  await app.register(serverAdminRoutes, { connectionManager });
  await app.register(statsRoutes, { usageTracker, outputCache });
  await app.register(llmRoutes, { pipeline });
  await app.register(fleetRoutes, { orchestrator, connectionManager, configStore });
  await app.register(sessionRoutes, { sessionStore, connectionManager });
  await app.register(agentRoutes, { connectionManager, agent: investigationAgent });
  await app.register(dynamicUIRoutes, { connectionManager, generator: dynamicUIGenerator, diskCache });
  await app.register(appStoreRoutes, { appStore });
  await app.register(observatoryRoutes, { traceStore });

  // UI Agent WebSocket (requires LLM)
  if (modelRouter) {
    await app.register(agentUIRoutes, {
      connectionManager: agentConnectionManager as ConnectionManager,
      modelRouter,
      templateRegistry: dynamicUIGenerator.getRegistry(),
    });
    console.log('🧙 UI Agent WebSocket enabled');
  }

  // -- Start --
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    const actualPort = (app.server.address() as import('net').AddressInfo).port;
    console.log(`🚀 HeadlessOS server running on http://localhost:${actualPort}`);
    // Signal the actual port to the Electron parent process (PORT=0 gets OS-assigned)
    process.stdout.write(`HEADLESSOS_PORT:${actualPort}\n`);
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
    console.log('\n🛑 Shutting down...');

    try {
      const activeIds = connectionManager.getConnectedServerIds();
      if (activeIds.length > 0) {
        console.log(`💾 Hibernating ${activeIds.length} active session(s)...`);
        await Promise.allSettled(
          activeIds.map((id) => sessionStore.markHibernated(id)),
        );
      }
    } catch (err) {
      console.warn('[shutdown] Session hibernation error:', err);
    }

    await app.close();
    outputCache.destroy();
    traceStore.clear();
    await container.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
