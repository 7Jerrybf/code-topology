#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('topology')
  .description('Code topology analysis tool - visualize your codebase dependencies')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze a directory and generate topology graph')
  .argument('[path]', 'Path to analyze', '.')
  .option('-o, --output <file>', 'Output JSON file path', '../web/public/data/topology-data.json')
  .action(async (path: string, options: { output: string }) => {
    console.log(`🔍 Analyzing: ${path}`);
    console.log(`📄 Output: ${options.output}`);
    // TODO: Implement analyzer
    console.log('⚠️  Analyzer not yet implemented');
  });

program.parse();
