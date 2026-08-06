#!/usr/bin/env node
/**
 * MCP Server for the unofficial Municode API — Streamable HTTP entry point.
 *
 * Wraps the reverse-engineered JSON API behind library.municode.com's
 * single-page app, so agents can browse and read municipal ordinance text
 * directly instead of hitting a JS-rendered wall on direct fetch. See
 * services/municodeClient.ts for the important caveat: this is unofficial
 * and unconfirmed against a live response as of this build.
 *
 * Runs as a small Express HTTP server exposing a single MCP endpoint at
 * POST /mcp, using the Streamable HTTP transport in STATELESS mode: each
 * request gets its own short-lived McpServer + transport pair, connected,
 * used, and torn down. No session state is kept between requests — safe
 * on hosts that spin the process down when idle (e.g. Render's free tier).
 *
 * Also exposes GET /health for host health checks (Render, uptime pingers).
 *
 * Optional auth: if the MCP_API_TOKEN environment variable is set, every
 * request to /mcp must carry `Authorization: Bearer <token>` or it is
 * rejected with 401. If MCP_API_TOKEN is unset, the server is open.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer } from "./createServer.js";

const PORT = Number(process.env.PORT) || 3000;
const API_TOKEN = process.env.MCP_API_TOKEN?.trim() || null;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", server: "municode-mcp-server", time: new Date().toISOString() });
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!API_TOKEN) {
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const expected = `Bearer ${API_TOKEN}`;
  if (header !== expected) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized — missing or invalid bearer token" },
      id: null
    });
    return;
  }
  next();
}

app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling /mcp request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed — this server runs in stateless mode (no server-initiated SSE stream). Use POST /mcp." },
    id: null
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed — this server runs in stateless mode (no session to terminate)." },
    id: null
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.error(`municode-mcp-server listening on 0.0.0.0:${PORT} (POST /mcp, GET /health)`);
  if (!API_TOKEN) {
    console.error("MCP_API_TOKEN is not set — /mcp is open with no authentication.");
  }
});
