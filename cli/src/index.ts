#!/usr/bin/env node

import { Command } from 'commander';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { analyzeDirectory, saveTopologyData, createSnapshot } from '@topology/core';
import { generateReport, type ReportFormat } from '@topology/core/reporter';
import { FileWatcher, TopologyWsServer } from '@topology/server';

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
  }) => {
    console.log(`\n🔍 Code Topology Analyzer\n`);

    try {
      const absolutePath = resolve(path);

      // Analyze the directory
      const graph = await analyzeDirectory(path, {
        baseBranch: options.base,
        skipGitDiff: !options.git,
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

      console.log(`\n✅ Topology data written to: ${outputPath}`);
      console.log(`   - Nodes: ${graph.nodes.length}`);
      console.log(`   - Edges: ${graph.edges.length}`);

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
  .action(async (path: string, options: {
    port: string;
    debounce: string;
    output: string;
    base?: string;
    git: boolean;
  }) => {
    console.log(`\n👁️  Code Topology Watch Mode\n`);

    const absolutePath = resolve(path);
    const port = parseInt(options.port, 10);
    const debounceMs = parseInt(options.debounce, 10);
    const outputPath = resolve(options.output);

    // Create file watcher
    const watcher = new FileWatcher({
      path: absolutePath,
      debounceMs,
    });

    // Create WebSocket server
    const wsServer = new TopologyWsServer({ port });

    // Analysis function
    const runAnalysis = async () => {
      try {
        console.log(`\n🔄 Running analysis...`);

        const graph = await analyzeDirectory(absolutePath, {
          baseBranch: options.base,
          skipGitDiff: !options.git,
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
      } catch (error) {
        console.error('❌ Analysis failed:', error);
        wsServer.broadcastError(error instanceof Error ? error.message : 'Analysis failed');
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

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n\n🛑 Shutting down...');
      await watcher.stop();
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
      console.log(`\n👀 Watching: ${absolutePath}`);
      console.log(`   Debounce: ${debounceMs}ms`);
      console.log(`\n   Press Ctrl+C to stop\n`);

    } catch (error) {
      console.error('❌ Failed to start watch mode:', error);
      await watcher.stop();
      await wsServer.stop();
      process.exit(1);
    }
  });

program.parse();
