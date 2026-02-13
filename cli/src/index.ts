#!/usr/bin/env node

import { Command } from 'commander';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { analyzeDirectory, saveTopologyData, createSnapshot, detectConflicts, resolveVectorConfig, type TopologyGraph } from '@topology/core';
import { generateReport, type ReportFormat } from '@topology/core/reporter';
import { CacheDb, AuthDb, UserManager, ApiKeyManager } from '@topology/core';
import type { VectorStoreConfig } from '@topology/protocol';
import { FileWatcher, GitWatcher, TopologyWsServer } from '@topology/server';
import type { GitWatcherEvent } from '@topology/server';
import type { Role } from '@topology/protocol';

const program = new Command();

program
  .name('topology')
  .description('Code topology analysis tool - visualize your codebase dependencies')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze a directory and generate topology graph')
  .argument('[path]', 'Path to analyze', '.')
  .option('-o, --output <file>', 'Output JSON file path', './packages/web/public/data/topology-data.json')
  .option('-b, --base <branch>', 'Base branch to compare against (default: auto-detect main/master)')
  .option('--no-git', 'Skip git diff analysis')
  .option('-H, --history', 'Enable history mode (append to existing snapshots)')
  .option('--max-snapshots <n>', 'Maximum number of snapshots to keep', '50')
  .option('--snapshot-label <text>', 'Custom label for this snapshot')
  .option('--report <format>', 'Generate report (markdown|json)')
  .option('--output-report <file>', 'Output report to file')
  .option('--fail-on-broken <n>', 'Exit with error if broken edges exceed threshold', '-1')
  .option('--no-cache', 'Disable SQLite parse cache')
  .option('--cache-dir <path>', 'Custom cache directory (default: <repo>/.topology/)')
  .option('--no-embeddings', 'Disable semantic embedding analysis')
  .option('--similarity-threshold <n>', 'Cosine similarity threshold for semantic edges', '0.7')
  .option('--vector-provider <provider>', 'Vector store provider: sqlite, pinecone, pgvector')
  .option('--pinecone-api-key <key>', 'Pinecone API key')
  .option('--pinecone-index <name>', 'Pinecone index name')
  .option('--pinecone-namespace <ns>', 'Pinecone namespace')
  .option('--pgvector-url <url>', 'pgvector connection string')
  .option('--no-vector-sync', 'Disable cloud vector sync')
  .option('--no-cloud-search', 'Disable cloud-based semantic search')
  .action(async (path: string, options: {
    output: string;
    base?: string;
    git: boolean;
    history?: boolean;
    maxSnapshots: string;
    snapshotLabel?: string;
    report?: string;
    outputReport?: string;
    failOnBroken: string;
    cache: boolean;
    cacheDir?: string;
    embeddings: boolean;
    similarityThreshold: string;
    vectorProvider?: string;
    pineconeApiKey?: string;
    pineconeIndex?: string;
    pineconeNamespace?: string;
    pgvectorUrl?: string;
    vectorSync: boolean;
    cloudSearch: boolean;
  }) => {
    console.log(`\n🔍 Code Topology Analyzer\n`);

    try {
      const absolutePath = resolve(path);

      // Resolve vector store config from CLI flags + env vars
      const vectorStoreConfig = resolveVectorConfig({
        provider: options.vectorProvider as VectorStoreConfig['provider'] | undefined,
        pinecone: options.pineconeApiKey && options.pineconeIndex
          ? { apiKey: options.pineconeApiKey, indexName: options.pineconeIndex, namespace: options.pineconeNamespace }
          : undefined,
        pgvector: options.pgvectorUrl
          ? { connectionString: options.pgvectorUrl }
          : undefined,
        sync: {
          enabled: options.vectorSync,
          useCloudSearch: options.cloudSearch,
        },
      });

      // Analyze the directory
      const graph = await analyzeDirectory(path, {
        baseBranch: options.base,
        skipGitDiff: !options.git,
        noCache: !options.cache,
        cacheDir: options.cacheDir,
        noEmbeddings: !options.embeddings,
        similarityThreshold: parseFloat(options.similarityThreshold),
        vectorStoreConfig,
      });

      // Ensure output directory exists
      const outputPath = resolve(options.output);
      await mkdir(dirname(outputPath), { recursive: true });

      // Save with history management
      const dataFile = await saveTopologyData(outputPath, graph, absolutePath, {
        history: options.history,
        maxSnapshots: parseInt(options.maxSnapshots, 10),
        label: options.snapshotLabel,
      });

      // Calculate stats
      const changedCount = graph.nodes.filter(n => n.status !== 'UNCHANGED').length;
      const addedCount = graph.nodes.filter(n => n.status === 'ADDED').length;
      const modifiedCount = graph.nodes.filter(n => n.status === 'MODIFIED').length;
      const deletedCount = graph.nodes.filter(n => n.status === 'DELETED').length;
      const brokenCount = graph.edges.filter(e => e.isBroken).length;

      const semanticEdgeCount = graph.edges.filter(e => e.linkType === 'semantic').length;
      const depEdgeCount = graph.edges.length - semanticEdgeCount;

      console.log(`\n✅ Topology data written to: ${outputPath}`);
      console.log(`   - Nodes: ${graph.nodes.length}`);
      console.log(`   - Dependency edges: ${depEdgeCount}`);
      if (semanticEdgeCount > 0) {
        console.log(`   - Semantic edges: ${semanticEdgeCount}`);
      }

      if (options.history) {
        console.log(`   - Snapshots: ${dataFile.snapshots.length}`);
      }

      if (changedCount > 0) {
        console.log(`\n📊 Changes detected:`);
        if (addedCount > 0) console.log(`   - Added: ${addedCount}`);
        if (modifiedCount > 0) console.log(`   - Modified: ${modifiedCount}`);
        if (deletedCount > 0) console.log(`   - Deleted: ${deletedCount}`);
      }

      if (brokenCount > 0) {
        console.log(`\n⚠️  Potentially broken dependencies: ${brokenCount}`);
      }

      // Generate report if requested
      if (options.report) {
        const format = options.report as ReportFormat;
        if (format !== 'markdown' && format !== 'json') {
          console.error(`❌ Invalid report format: ${options.report}. Use 'markdown' or 'json'.`);
          process.exit(1);
        }

        const report = generateReport({
          graph,
          format,
          baseBranch: options.base,
        });

        if (options.outputReport) {
          const reportPath = resolve(options.outputReport);
          await mkdir(dirname(reportPath), { recursive: true });
          await writeFile(reportPath, report, 'utf-8');
          console.log(`\n📝 Report written to: ${reportPath}`);
        } else {
          console.log(`\n📝 Report:\n`);
          console.log(report);
        }
      }

      // Check fail-on-broken threshold
      const threshold = parseInt(options.failOnBroken, 10);
      if (threshold >= 0 && brokenCount > threshold) {
        console.error(`\n❌ Broken dependencies (${brokenCount}) exceed threshold (${threshold})`);
        process.exit(1);
      }

      if (!options.report) {
        console.log(`\n💡 Start the web viewer with: pnpm dev:web\n`);
      }
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch directory and push updates via WebSocket')
  .argument('[path]', 'Path to watch', '.')
  .option('-p, --port <number>', 'WebSocket server port', '8765')
  .option('-d, --debounce <ms>', 'Debounce delay in milliseconds', '300')
  .option('-o, --output <file>', 'Output JSON file path', './packages/web/public/data/topology-data.json')
  .option('-b, --base <branch>', 'Base branch to compare against')
  .option('--no-git', 'Skip git diff analysis')
  .option('--no-cache', 'Disable SQLite parse cache')
  .option('--cache-dir <path>', 'Custom cache directory (default: <repo>/.topology/)')
  .option('--no-embeddings', 'Disable semantic embedding analysis')
  .option('--similarity-threshold <n>', 'Cosine similarity threshold for semantic edges', '0.7')
  .option('--vector-provider <provider>', 'Vector store provider: sqlite, pinecone, pgvector')
  .option('--pinecone-api-key <key>', 'Pinecone API key')
  .option('--pinecone-index <name>', 'Pinecone index name')
  .option('--pinecone-namespace <ns>', 'Pinecone namespace')
  .option('--pgvector-url <url>', 'pgvector connection string')
  .option('--no-vector-sync', 'Disable cloud vector sync')
  .option('--no-cloud-search', 'Disable cloud-based semantic search')
  .action(async (path: string, options: {
    port: string;
    debounce: string;
    output: string;
    base?: string;
    git: boolean;
    cache: boolean;
    cacheDir?: string;
    embeddings: boolean;
    similarityThreshold: string;
    vectorProvider?: string;
    pineconeApiKey?: string;
    pineconeIndex?: string;
    pineconeNamespace?: string;
    pgvectorUrl?: string;
    vectorSync: boolean;
    cloudSearch: boolean;
  }) => {
    console.log(`\n👁️  Code Topology Watch Mode\n`);

    const absolutePath = resolve(path);
    const port = parseInt(options.port, 10);
    const debounceMs = parseInt(options.debounce, 10);
    const outputPath = resolve(options.output);

    // Resolve vector store config
    const vectorStoreConfig = resolveVectorConfig({
      provider: options.vectorProvider as VectorStoreConfig['provider'] | undefined,
      pinecone: options.pineconeApiKey && options.pineconeIndex
        ? { apiKey: options.pineconeApiKey, indexName: options.pineconeIndex, namespace: options.pineconeNamespace }
        : undefined,
      pgvector: options.pgvectorUrl
        ? { connectionString: options.pgvectorUrl }
        : undefined,
      sync: {
        enabled: options.vectorSync,
        useCloudSearch: options.cloudSearch,
      },
    });

    // Create file watcher
    const watcher = new FileWatcher({
      path: absolutePath,
      debounceMs,
    });

    // Create git watcher
    const gitWatcher = new GitWatcher({
      path: absolutePath,
    });

    // Create WebSocket server
    const wsServer = new TopologyWsServer({ port });

    // Lock to prevent concurrent analysis runs
    let analysisInProgress = false;
    let analysisPending = false;

    // Run conflict detection asynchronously after analysis
    const runConflictDetection = async (graph: TopologyGraph) => {
      try {
        const warnings = await detectConflicts({
          repoPath: absolutePath,
          graph,
          baseBranch: options.base,
        });

        if (warnings.length > 0) {
          const highCount = warnings.filter(w => w.severity === 'high').length;
          const mediumCount = warnings.filter(w => w.severity === 'medium').length;
          const lowCount = warnings.filter(w => w.severity === 'low').length;

          const parts = [];
          if (highCount > 0) parts.push(`${highCount} direct`);
          if (mediumCount > 0) parts.push(`${mediumCount} dependency`);
          if (lowCount > 0) parts.push(`${lowCount} semantic`);

          console.log(`\n🔴 Conflict warnings: ${parts.join(', ')}`);
          for (const w of warnings) {
            const icon = w.severity === 'high' ? '🔴' : w.severity === 'medium' ? '🟠' : '🟡';
            console.log(`   ${icon} [${w.otherBranch}] ${w.description}`);
          }

          wsServer.broadcastConflictWarnings(warnings);
        }
      } catch (error) {
        console.warn('⚠️  Conflict detection failed:', error instanceof Error ? error.message : error);
      }
    };

    // Analysis function with lock
    const runAnalysis = async () => {
      if (analysisInProgress) {
        analysisPending = true;
        return;
      }
      analysisInProgress = true;
      try {
        console.log(`\n🔄 Running analysis...`);

        const graph = await analyzeDirectory(absolutePath, {
          baseBranch: options.base,
          skipGitDiff: !options.git,
          noCache: !options.cache,
          cacheDir: options.cacheDir,
          noEmbeddings: !options.embeddings,
          similarityThreshold: parseFloat(options.similarityThreshold),
          vectorStoreConfig,
        });

        // Save to file
        await mkdir(dirname(outputPath), { recursive: true });
        const snapshot = await createSnapshot(graph, absolutePath);

        // Broadcast to WebSocket clients
        wsServer.broadcastSnapshot(snapshot);

        // Also save to file for web client that might reload
        const dataFile = {
          version: 2,
          currentIndex: 0,
          snapshots: [snapshot],
        };
        await writeFile(outputPath, JSON.stringify(dataFile, null, 2), 'utf-8');

        const brokenCount = graph.edges.filter(e => e.isBroken).length;
        console.log(`✅ Analysis complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
        if (brokenCount > 0) {
          console.log(`⚠️  Potentially broken dependencies: ${brokenCount}`);
        }

        // Run conflict detection asynchronously (non-blocking)
        runConflictDetection(graph);
      } catch (error) {
        console.error('❌ Analysis failed:', error);
        wsServer.broadcastError(error instanceof Error ? error.message : 'Analysis failed');
      } finally {
        analysisInProgress = false;
        if (analysisPending) {
          analysisPending = false;
          await runAnalysis();
        }
      }
    };

    // Handle file changes
    watcher.on('changes', async (changes: { type: string; path: string }[]) => {
      const addCount = changes.filter(c => c.type === 'add').length;
      const changeCount = changes.filter(c => c.type === 'change').length;
      const unlinkCount = changes.filter(c => c.type === 'unlink').length;

      const parts = [];
      if (addCount > 0) parts.push(`+${addCount}`);
      if (changeCount > 0) parts.push(`~${changeCount}`);
      if (unlinkCount > 0) parts.push(`-${unlinkCount}`);

      console.log(`\n📝 Files changed: ${parts.join(', ')}`);
      await runAnalysis();
    });

    // Handle git events
    gitWatcher.on('git_event', async (event: GitWatcherEvent) => {
      const details = event.previousBranch
        ? `${event.previousBranch} → ${event.branch}`
        : event.branch;
      console.log(`\n🔀 Git event: ${event.eventType} (${details})`);

      wsServer.broadcastGitEvent({
        eventType: event.eventType,
        branch: event.branch,
        commitHash: event.commitHash,
        previousBranch: event.previousBranch,
        timestamp: event.timestamp,
      });

      await runAnalysis();
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n\n🛑 Shutting down...');
      await watcher.stop();
      await gitWatcher.stop();
      await wsServer.stop();
      console.log('👋 Goodbye!\n');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    try {
      // Start WebSocket server
      await wsServer.start();

      // Run initial analysis
      await runAnalysis();

      // Start file watcher
      await watcher.start();

      // Start git watcher
      await gitWatcher.start();

      console.log(`\n👀 Watching: ${absolutePath}`);
      console.log(`   Debounce: ${debounceMs}ms`);
      console.log(`   Git events: enabled`);
      console.log(`\n   Press Ctrl+C to stop\n`);

    } catch (error) {
      console.error('❌ Failed to start watch mode:', error);
      await watcher.stop();
      await gitWatcher.stop();
      await wsServer.stop();
      process.exit(1);
    }
  });

// ── Auth subcommands ───────────────────────────────────────────

const auth = program
  .command('auth')
  .description('Manage RBAC authentication (users, API keys)');

/**
 * Helper: open CacheDb + AuthDb for auth commands
 */
function openAuthDb(cacheDir?: string): { cacheDb: CacheDb; authDb: AuthDb } {
  const repoRoot = resolve('.');
  const cacheDb = new CacheDb(repoRoot, cacheDir);
  cacheDb.open();
  const authDb = new AuthDb(cacheDb.database);
  return { cacheDb, authDb };
}

auth
  .command('init')
  .description('Enable RBAC, create initial admin user and API key')
  .option('--cache-dir <path>', 'Custom cache directory')
  .option('--password <pass>', 'Admin password (prompted if not given)', 'admin')
  .action(async (options: { cacheDir?: string; password: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      if (authDb.isAuthEnabled()) {
        console.log('Auth is already enabled.');
        cacheDb.close();
        return;
      }

      const userManager = new UserManager(authDb);
      const apiKeyManager = new ApiKeyManager(authDb);

      // Create admin user
      const admin = await userManager.createUser({
        username: 'admin',
        password: options.password,
        role: 'admin',
      });

      // Create first API key
      const { rawKey } = apiKeyManager.create({
        userId: admin.id,
        label: 'initial-admin-key',
      });

      // Enable auth
      authDb.setConfig('enabled', 'true');

      console.log('\nRBAC enabled successfully!\n');
      console.log(`  Admin user: admin`);
      console.log(`  API Key:    ${rawKey}`);
      console.log('\n  Save this API key — it cannot be retrieved later.\n');
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('create-user')
  .description('Create a new user')
  .argument('<username>', 'Username')
  .requiredOption('--role <role>', 'Role: admin, editor, or viewer')
  .requiredOption('--password <pass>', 'User password')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action(async (username: string, options: { role: string; password: string; cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      const userManager = new UserManager(authDb);
      await userManager.createUser({
        username,
        password: options.password,
        role: options.role as Role,
      });
      console.log(`User "${username}" created with role "${options.role}".`);
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('list-users')
  .description('List all users')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action((options: { cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      const users = authDb.listUsers();
      if (users.length === 0) {
        console.log('No users found. Run `topology auth init` first.');
        return;
      }
      console.log('\nUsers:\n');
      for (const u of users) {
        const status = u.enabled ? 'active' : 'disabled';
        console.log(`  ${u.username}  role=${u.role}  status=${status}  id=${u.id}`);
      }
      console.log('');
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('delete-user')
  .description('Delete a user')
  .argument('<username>', 'Username to delete')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action((username: string, options: { cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      const userManager = new UserManager(authDb);
      userManager.deleteUser(username);
      console.log(`User "${username}" deleted.`);
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('create-key')
  .description('Create an API key for a user')
  .requiredOption('--user <username>', 'Username')
  .requiredOption('--label <label>', 'Key label')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action((options: { user: string; label: string; cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      const userRow = authDb.getUserByUsername(options.user);
      if (!userRow) {
        console.error(`User "${options.user}" not found.`);
        process.exit(1);
      }

      const apiKeyManager = new ApiKeyManager(authDb);
      const { rawKey } = apiKeyManager.create({
        userId: userRow.id,
        label: options.label,
      });

      console.log(`\nAPI Key created for "${options.user}":\n`);
      console.log(`  ${rawKey}`);
      console.log('\n  Save this key — it cannot be retrieved later.\n');
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('list-keys')
  .description('List API keys')
  .option('--user <username>', 'Filter by username')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action((options: { user?: string; cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      let userId: string | undefined;
      if (options.user) {
        const userRow = authDb.getUserByUsername(options.user);
        if (!userRow) {
          console.error(`User "${options.user}" not found.`);
          process.exit(1);
        }
        userId = userRow.id;
      }

      const apiKeyManager = new ApiKeyManager(authDb);
      const keys = apiKeyManager.list(userId);

      if (keys.length === 0) {
        console.log('No API keys found.');
        return;
      }

      console.log('\nAPI Keys:\n');
      for (const k of keys) {
        const status = k.revoked ? 'revoked' : 'active';
        const lastUsed = k.last_used_at ? new Date(k.last_used_at).toISOString() : 'never';
        console.log(`  id=${k.id}  user=${k.user_id}  label="${k.label}"  status=${status}  lastUsed=${lastUsed}`);
      }
      console.log('');
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('revoke-key')
  .description('Revoke an API key')
  .argument('<keyId>', 'API key ID to revoke')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action((keyId: string, options: { cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      const apiKeyManager = new ApiKeyManager(authDb);
      apiKeyManager.revoke(keyId);
      console.log(`API key "${keyId}" revoked.`);
    } finally {
      cacheDb.close();
    }
  });

auth
  .command('disable')
  .description('Disable RBAC (all endpoints become open)')
  .option('--cache-dir <path>', 'Custom cache directory')
  .action((options: { cacheDir?: string }) => {
    const { cacheDb, authDb } = openAuthDb(options.cacheDir);
    try {
      authDb.setConfig('enabled', 'false');
      console.log('Auth disabled. All endpoints are now open.');
    } finally {
      cacheDb.close();
    }
  });

program.parse();
