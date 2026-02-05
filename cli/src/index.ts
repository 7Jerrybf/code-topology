#!/usr/bin/env node

import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { analyzeDirectory } from './analyzer/index.js';

const program = new Command();

program
  .name('topology')
  .description('Code topology analysis tool - visualize your codebase dependencies')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze a directory and generate topology graph')
  .argument('[path]', 'Path to analyze', '.')
  .option('-o, --output <file>', 'Output JSON file path', './web/public/data/topology-data.json')
  .option('-b, --base <branch>', 'Base branch to compare against (default: auto-detect main/master)')
  .option('--no-git', 'Skip git diff analysis')
  .action(async (path: string, options: { output: string; base?: string; git: boolean }) => {
    console.log(`\n🔍 Code Topology Analyzer\n`);

    try {
      // Analyze the directory
      const graph = await analyzeDirectory(path, {
        baseBranch: options.base,
        skipGitDiff: !options.git,
      });

      // Ensure output directory exists
      const outputPath = resolve(options.output);
      await mkdir(dirname(outputPath), { recursive: true });

      // Write JSON output
      await writeFile(outputPath, JSON.stringify(graph, null, 2), 'utf-8');

      // Calculate stats
      const changedCount = graph.nodes.filter(n => n.status !== 'UNCHANGED').length;
      const addedCount = graph.nodes.filter(n => n.status === 'ADDED').length;
      const modifiedCount = graph.nodes.filter(n => n.status === 'MODIFIED').length;
      const deletedCount = graph.nodes.filter(n => n.status === 'DELETED').length;
      const brokenCount = graph.edges.filter(e => e.isBroken).length;

      console.log(`\n✅ Topology data written to: ${outputPath}`);
      console.log(`   - Nodes: ${graph.nodes.length}`);
      console.log(`   - Edges: ${graph.edges.length}`);

      if (changedCount > 0) {
        console.log(`\n📊 Changes detected:`);
        if (addedCount > 0) console.log(`   - Added: ${addedCount}`);
        if (modifiedCount > 0) console.log(`   - Modified: ${modifiedCount}`);
        if (deletedCount > 0) console.log(`   - Deleted: ${deletedCount}`);
      }

      if (brokenCount > 0) {
        console.log(`\n⚠️  Potentially broken dependencies: ${brokenCount}`);
      }

      console.log(`\n💡 Start the web viewer with: pnpm dev:web\n`);
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  });

program.parse();
