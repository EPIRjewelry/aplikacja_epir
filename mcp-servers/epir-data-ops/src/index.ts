#!/usr/bin/env node
import { runStdioServer } from './server.js';

runStdioServer().catch((err) => {
  console.error('[epir-mcp-data-ops]', err);
  process.exit(1);
});
