#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildHtml, processAppBundle, processMermaidBundle, processElkBundle, createServer } from "./shared.js";
import { libavoidUrls } from "./libavoid-versions.js";
import { registerDiagramTools } from "./diagram-tools.js";
import { createNodeDiagramStore } from "./node-diagram-store.js";

function getBuildId()
{
  var sha = "no-git";
  var dirty = "";

  try
  {
    sha = execSync("git rev-parse --short HEAD", { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: ["pipe", "pipe", "ignore"] }).toString().trim();

    try
    {
      var status = execSync("git status --porcelain", { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: ["pipe", "pipe", "ignore"] }).toString().trim();

      if (status)
      {
        dirty = "-dirty";
      }
    }
    catch (e) {}
  }
  catch (e) {}

  return sha + dirty + "@" + new Date().toISOString();
}

const buildId = getBuildId();
const diagramStore = createNodeDiagramStore();

const extAppsEntry = fileURLToPath(import.meta.resolve("@modelcontextprotocol/ext-apps/app-with-deps"));
const appWithDepsRaw = fs.readFileSync(extAppsEntry, "utf-8");
const appWithDepsJs = processAppBundle(appWithDepsRaw);

const pakoEntry = fileURLToPath(import.meta.resolve("pako"));
const pakoDeflateJs = fs.readFileSync(
  path.join(path.dirname(pakoEntry), "..", "dist", "pako_deflate.min.js"),
  "utf-8"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

var elkJs = null;

if (process.env.ELK_PATH)
{
  elkJs = processElkBundle(fs.readFileSync(path.resolve(process.env.ELK_PATH), "utf-8"));
  console.log("Inlining local drawio-elk from", process.env.ELK_PATH);
}

var mermaidJs = null;

if (process.env.MERMAID_PATH)
{
  mermaidJs = processMermaidBundle(fs.readFileSync(path.resolve(process.env.MERMAID_PATH), "utf-8"));
  console.log("Inlining local drawio-mermaid from", process.env.MERMAID_PATH);
}

var libavoidScriptUrls = await libavoidUrls();
var viewerJs = null;

if (process.env.VIEWER_PATH)
{
  const viewerPath = path.resolve(process.env.VIEWER_PATH);

  if (fs.statSync(viewerPath).isDirectory())
  {
    const minJs = path.join(viewerPath, "viewer-static.min.js");
    const gvJs = path.join(viewerPath, "diagramly", "GraphViewer.js");
    viewerJs = fs.readFileSync(minJs, "utf-8");

    if (fs.existsSync(gvJs))
    {
      viewerJs += "\n" + fs.readFileSync(gvJs, "utf-8");
    }

    console.log("Using local viewer from", viewerPath);
  }
  else
  {
    viewerJs = fs.readFileSync(viewerPath, "utf-8");
    console.log("Using local viewer from", viewerPath);
  }
}

const xmlReference = fs.readFileSync(
  path.join(__dirname, "..", "..", "shared", "xml-reference.md"),
  "utf-8"
);

const mermaidReference = fs.readFileSync(
  path.join(__dirname, "..", "..", "shared", "mermaid-reference.md"),
  "utf-8"
);

const shapeIndexPath = path.join(__dirname, "..", "..", "shape-search", "search-index.json");
var shapeIndex = null;

if (fs.existsSync(shapeIndexPath))
{
  shapeIndex = JSON.parse(fs.readFileSync(shapeIndexPath, "utf-8"));
  console.log("Shape index: " + shapeIndex.length + " shapes");
}

let html = buildHtml(appWithDepsJs, pakoDeflateJs, mermaidJs,
  { viewerJs, elkJs, buildId, libavoidUrls: libavoidScriptUrls });

function createConfiguredServer()
{
  const server = createServer(html, {
    domain: process.env.DOMAIN,
    xmlReference,
    mermaidReference,
    shapeIndex,
    buildId,
  });

  registerDiagramTools(server, diagramStore);
  return server;
}

async function startStreamableHTTPServer()
{
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const host = process.env.LISTEN ?? "127.0.0.1";
  const allowedHosts = process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(",").map(function(h) { return h.trim(); })
    : undefined;
  const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts });

  setInterval(async function()
  {
    try
    {
      const urls = await libavoidUrls(libavoidScriptUrls);

      if (urls.join("\n") !== libavoidScriptUrls.join("\n"))
      {
        libavoidScriptUrls = urls;
        html = buildHtml(appWithDepsJs, pakoDeflateJs, mermaidJs,
          { viewerJs, elkJs, buildId, libavoidUrls: urls });
        console.log("libavoid CDN versions changed; HTML rebuilt");
      }
    }
    catch (e) {}
  }, 24 * 60 * 60 * 1000).unref();

  const faviconPath = path.join(__dirname, "..", "favicon.png");

  app.get(["/favicon.ico", "/favicon.png"], function(req, res)
  {
    res.sendFile(faviconPath);
  });

  app.get("/healthz", function(req, res)
  {
    res.json({ status: "ok", buildId });
  });

  app.all("/mcp", async function(req, res)
  {
    const method = req.body && req.body.method;
    const sessionId = (req.headers["mcp-session-id"] || "").slice(0, 8);
    const start = Date.now();
    console.log(`[req] ${req.method} method=${method || "(none)"} session=${sessionId} accept=${req.headers["accept"] || ""}`);

    res.on("finish", function()
    {
      const elapsed = Date.now() - start;
      console.log(`[res] method=${method || "(none)"} session=${sessionId} status=${res.statusCode} ${elapsed}ms`);
    });

    const server = createConfiguredServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", function()
    {
      transport.close().catch(function() {});
      server.close().catch(function() {});
    });

    try
    {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }
    catch (error)
    {
      console.error("MCP error:", error);

      if (!res.headersSent)
      {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, "0.0.0.0", function()
  {
    console.log(`MCP App server listening on http://${host}:${port}/mcp`);
  });

  const shutdown = function()
  {
    console.log("\nShutting down...");
    httpServer.close(function() { process.exit(0); });
    setTimeout(function() { process.exit(0); }, 1000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startStdioServer()
{
  await createConfiguredServer().connect(new StdioServerTransport());
}

async function main()
{
  if (process.argv.includes("--stdio"))
  {
    await startStdioServer();
  }
  else
  {
    await startStreamableHTTPServer();
  }
}

main().catch(function(e)
{
  console.error(e);
  process.exit(1);
});
