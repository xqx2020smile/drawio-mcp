import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { createDiagramId, isValidDiagramId } from "./diagram-store.js";
import { normalizeDiagramXml } from "./normalize-diagram-xml.js";

const RESOURCE_URI = "ui://drawio/mcp-app.html";

function diagramPayload(entry)
{
  const payload = entry.format === "mermaid"
    ? { mermaid: entry.content }
    : { xml: entry.content };

  if (entry.postLayout) payload.postLayout = entry.postLayout;
  if (entry.direction) payload.direction = entry.direction;
  if (entry.routing) payload.routing = entry.routing;
  payload.diagramId = entry.id;
  payload.name = entry.name || null;
  payload.version = entry.version;

  return payload;
}

function displayResult(entry, message)
{
  return {
    content: [
      { type: "text", text: JSON.stringify(diagramPayload(entry)) },
      { type: "text", text: message },
    ],
  };
}

function normalizeInput(xml, mermaid)
{
  const hasXml = typeof xml === "string" && xml.trim().length > 0;
  const hasMermaid = typeof mermaid === "string" && mermaid.trim().length > 0;

  if (hasXml === hasMermaid)
  {
    throw new Error("Provide exactly one of 'xml' or 'mermaid'.");
  }

  if (hasMermaid)
  {
    return { format: "mermaid", content: mermaid.trim() };
  }

  const normalized = normalizeDiagramXml(xml);

  if (!normalized)
  {
    throw new Error("Could not extract valid draw.io XML from the input.");
  }

  return { format: "xml", content: normalized };
}

function errorResult(error)
{
  return {
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

export function registerDiagramTools(server, store)
{
  registerAppTool(
    server,
    "save_diagram",
    {
      title: "Save Diagram",
      description: "Creates a named diagram in the server-side diagram store and displays it inline. Use this instead of create_diagram when the user wants to modify the same diagram in later turns.",
      inputSchema: {
        diagramId: z.string().optional().describe("Optional stable ID. Use letters, numbers, dots, underscores, and hyphens only."),
        name: z.string().max(120).optional().describe("Human-readable diagram name."),
        xml: z.string().optional().describe("Draw.io XML. Mutually exclusive with mermaid."),
        mermaid: z.string().optional().describe("Mermaid source. Mutually exclusive with xml."),
        postLayout: z.enum(["elk"]).optional(),
        direction: z.enum(["vertical", "horizontal"]).optional(),
        routing: z.enum(["libavoid"]).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI },
        "openai/toolInvocation/invoking": "Saving diagram...",
        "openai/toolInvocation/invoked": "Diagram saved.",
      },
    },
    async function(args)
    {
      try
      {
        const normalized = normalizeInput(args.xml, args.mermaid);
        const id = args.diagramId || createDiagramId();

        if (!isValidDiagramId(id))
        {
          throw new Error("Invalid diagramId. Use 1-64 letters, numbers, dots, underscores, or hyphens.");
        }

        const entry = await store.put(id, {
          name: args.name || null,
          format: normalized.format,
          content: normalized.content,
          postLayout: args.postLayout || null,
          direction: normalized.format === "xml" ? (args.direction || null) : null,
          routing: normalized.format === "xml" ? (args.routing || null) : null,
        });

        return displayResult(entry, "Saved diagram '" + id + "' at version " + entry.version + ".");
      }
      catch (error)
      {
        return errorResult(error);
      }
    }
  );

  registerAppTool(
    server,
    "get_diagram",
    {
      title: "Get Diagram",
      description: "Loads a stored diagram by ID and displays it inline in the chat.",
      inputSchema: {
        diagramId: z.string().describe("Stored diagram ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI },
        "openai/toolInvocation/invoking": "Loading diagram...",
        "openai/toolInvocation/invoked": "Diagram loaded.",
      },
    },
    async function({ diagramId })
    {
      const entry = await store.get(diagramId);

      if (!entry)
      {
        return errorResult(new Error("Diagram not found: " + diagramId));
      }

      return displayResult(entry, "Loaded diagram '" + diagramId + "' version " + entry.version + ".");
    }
  );

  registerAppTool(
    server,
    "update_diagram",
    {
      title: "Update Diagram",
      description: "Replaces the content of an existing stored diagram and displays the updated version inline. Read the diagram first when preserving existing content matters.",
      inputSchema: {
        diagramId: z.string().describe("Stored diagram ID."),
        name: z.string().max(120).optional(),
        xml: z.string().optional().describe("Replacement draw.io XML. Mutually exclusive with mermaid."),
        mermaid: z.string().optional().describe("Replacement Mermaid source. Mutually exclusive with xml."),
        postLayout: z.enum(["elk"]).optional(),
        direction: z.enum(["vertical", "horizontal"]).optional(),
        routing: z.enum(["libavoid"]).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI },
        "openai/toolInvocation/invoking": "Updating diagram...",
        "openai/toolInvocation/invoked": "Diagram updated.",
      },
    },
    async function(args)
    {
      try
      {
        const previous = await store.get(args.diagramId);

        if (!previous)
        {
          throw new Error("Diagram not found: " + args.diagramId);
        }

        const normalized = normalizeInput(args.xml, args.mermaid);
        const entry = await store.put(args.diagramId, {
          name: args.name !== undefined ? args.name : previous.name,
          format: normalized.format,
          content: normalized.content,
          postLayout: args.postLayout || null,
          direction: normalized.format === "xml" ? (args.direction || null) : null,
          routing: normalized.format === "xml" ? (args.routing || null) : null,
        });

        return displayResult(entry, "Updated diagram '" + args.diagramId + "' to version " + entry.version + ".");
      }
      catch (error)
      {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "list_diagrams",
    {
      title: "List Diagrams",
      description: "Lists stored diagrams without returning their full XML or Mermaid content.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Listing diagrams...",
        "openai/toolInvocation/invoked": "Diagram list ready.",
      },
    },
    async function()
    {
      const entries = await store.list();
      return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
    }
  );

  server.registerTool(
    "delete_diagram",
    {
      title: "Delete Diagram",
      description: "Deletes a stored diagram by ID.",
      inputSchema: {
        diagramId: z.string().describe("Stored diagram ID."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Deleting diagram...",
        "openai/toolInvocation/invoked": "Diagram deleted.",
      },
    },
    async function({ diagramId })
    {
      const deleted = await store.delete(diagramId);
      return {
        content: [{ type: "text", text: deleted ? "Deleted diagram: " + diagramId : "Diagram not found: " + diagramId }],
      };
    }
  );
}
