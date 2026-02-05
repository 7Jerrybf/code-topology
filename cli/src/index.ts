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
  .action(async (path: string, options: { output: string }) => {
    console.log(`\n🔍 Code Topology Analyzer\n`);

    try {
      // Analyze the directory
      const graph = await analyzeDirectory(path);

      // Ensure output directory exists
      const outputPath = resolve(options.output);
      await mkdir(dirname(outputPath), { recursive: true });

      // Write JSON output
      await writeFile(outputPath, JSON.stringify(graph, null, 2), 'utf-8');

      console.log(`\n✅ Topology data written to: ${outputPath}`);
      console.log(`   - Nodes: ${graph.nodes.length}`);
      console.log(`   - Edges: ${graph.edges.length}`);
      console.log(`\n💡 Start the web viewer with: pnpm dev:web\n`);
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  });

program.parse();
