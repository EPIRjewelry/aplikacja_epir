#!/usr/bin/env node
import { runStdioServer } from './server.js';

runStdioServer().catch((err) => {
  console.error('[epir-mcp-gworkspace]', err);
  process.exit(1);
});
