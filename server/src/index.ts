// M0.4 + M1: Fastify Server — wired with all Phase 1 services
// @see docs/phases/phase-0.md, docs/phases/phase-1.md

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { ServiceContainer } from './services/container.js';
import { ConnectionManager } from './ssh/connection-manager.js';
import { ConfigStore } from './config/store.js';
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
import { agentRoutes } from './routes/agent.js';
import { dynamicUIRoutes } from './routes/dynamic-ui.js';
import { allParsers } from './parsers/deterministic/index.js';
import { OutputCache } from './cache/output-cache.js';
import { LLMUsageTracker } from './llm/usage-tracker.js';
import { InvestigationAgent } from './agent/investigation-agent.js';
import { DynamicUIGenerator } from './dynamic-ui/generator.js';
import { DynamicUIDiskCache } from './cache/dynamic-ui-cache.js';
import { ModelRouter } from './llm/model-router.js';

const PORT = Number(process.env.PORT) || 3001;

async function main(): Promise<void> {
  // -- Service Container --
  const container = new ServiceContainer();

  const configStore = new ConfigStore('config');
  const connectionManager = new ConnectionManager('ssh');
  const pipeline = new ParsingPipeline('parser');
  const orchestrator = new CommandOrchestrator('orchestrator');
  const outputCache = new OutputCache();
  const usageTracker = new LLMUsageTracker();
  const investigationAgent = new InvestigationAgent(connectionManager, null);
  const diskCache = new DynamicUIDiskCache();
  await diskCache.init();
  let dynamicUIGenerator = new DynamicUIGenerator({ outputCache, usageTracker, diskCache });

  container.register('config', configStore);
  container.register('ssh', connectionManager);
  container.register('parser', pipeline);
  container.register('orchestrator', orchestrator);

  // LLM provider is optional — configured if OPENAI_API_KEY is set
  let modelRouter: ModelRouter | null = null;
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
  } else {
    console.log('⚠️  No OPENAI_API_KEY set — LLM parsing disabled (deterministic parsers only)');
  }

  await container.boot();
  console.log('✅ Service container booted');

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
      const allowed = !origin || origin === 'null' || origin === 'http://localhost:3000';
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
  await app.register(serverRoutes, { connectionManager, configStore });
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
  await app.register(agentRoutes, { connectionManager, agent: investigationAgent });
  await app.register(dynamicUIRoutes, { connectionManager, generator: dynamicUIGenerator, diskCache });

  // -- Start --
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`🚀 HeadlessOS server running on http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // -- Graceful Shutdown --
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    await app.close();
    outputCache.destroy();
    await container.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
