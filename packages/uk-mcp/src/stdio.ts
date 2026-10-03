#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createUkOpenDataMcpServer } from './ukOpenDataMcpServer.js';

const server = createUkOpenDataMcpServer();
await server.connect(new StdioServerTransport());
