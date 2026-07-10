# Use Draw.io MCP in ChatGPT

ChatGPT supports the MCP Apps standard for embedded iframe UIs. This server already exposes its diagram viewer through `_meta.ui.resourceUri` and communicates over the standard `ui/*` bridge, so the MCP App server can render diagrams inline in ChatGPT.

OpenAI reference:

- [MCP Apps compatibility in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt)
- [Connect an MCP app from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)

## 1. Run the server

### Docker Compose

From the repository root:

```bash
cp .env.example .env
docker compose up --build -d
```

The local MCP endpoint is:

```text
http://localhost:3001/mcp
```

Check the container status:

```bash
docker compose ps
docker compose logs -f drawio-mcp
```

### Node.js

```bash
cd mcp-app-server
npm ci
LISTEN=0.0.0.0 PORT=3001 npm start
```

## 2. Expose it over HTTPS

ChatGPT requires a reachable HTTPS MCP endpoint. For local testing, expose port `3001` with a secure tunnel, for example:

```bash
cloudflared tunnel --url http://localhost:3001
```

Use the generated HTTPS address and append `/mcp`:

```text
https://your-tunnel.example/mcp
```

For a permanent deployment, put the container behind an HTTPS reverse proxy and set:

```dotenv
DOMAIN=https://drawio-mcp.example.com
ALLOWED_HOSTS=drawio-mcp.example.com
```

`DOMAIN` must be an origin, without a path or trailing `/mcp`.

## 3. Add it to ChatGPT

1. In ChatGPT, open **Settings → Security and login** and enable **Developer mode**.
2. Open **Settings → Plugins**.
3. Create a new developer-mode app.
4. Enter a name and description.
5. Set the MCP server URL to your public endpoint, for example:

```text
https://drawio-mcp.example.com/mcp
```

6. Create the app and confirm that ChatGPT discovers `create_diagram` and `search_shapes`.

## 4. Test prompts

```text
Use Draw.io MCP to create a left-to-right architecture diagram showing:
Camera → FPGA preprocessing → Jetson GPU inference → application.
```

```text
Create an AWS architecture diagram. Search the Draw.io shape library before generating the XML.
```

## Troubleshooting

### The app connects but no diagram appears

- Start a new conversation after adding or updating the app.
- Ensure the app is enabled in the conversation tool picker.
- Confirm the tool descriptor contains `_meta.ui.resourceUri`.
- Check that the HTTPS endpoint returns MCP responses at `/mcp`, not at `/`.

### The widget loads but external assets fail

The default viewer loads scripts and assets from:

- `https://viewer.diagrams.net`
- `https://app.diagrams.net`

Allow outbound access to these origins, or configure a self-hosted viewer with `VIEWER_PATH`.

### Host validation fails

Set `ALLOWED_HOSTS` to a comma-separated list of accepted Host headers. Do not include `https://` in these entries.

### Container is unhealthy

```bash
docker compose logs drawio-mcp
docker inspect --format='{{json .State.Health}}' drawio-mcp-app
```

The image health check verifies that the configured TCP port is accepting connections.

## Data handling

When you self-host the MCP server, diagram payloads are handled by your deployment. The default browser component still downloads viewer code from diagrams.net unless you provide a local `VIEWER_PATH`. The language model provider remains a separate part of the data path because the model generates the diagram content.
