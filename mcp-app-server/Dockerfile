FROM node:22-alpine AS dependencies

WORKDIR /app/mcp-app-server

COPY mcp-app-server/package*.json ./
RUN npm ci --omit=dev


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    LISTEN=0.0.0.0

COPY --from=dependencies /app/mcp-app-server/node_modules ./mcp-app-server/node_modules
COPY mcp-app-server ./mcp-app-server
COPY shared ./shared
COPY shape-search/search-index.json ./shape-search/search-index.json

WORKDIR /app/mcp-app-server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "const net=require('node:net');const s=net.connect(Number(process.env.PORT||3001),'127.0.0.1',()=>{s.end();process.exit(0)});s.setTimeout(2000,()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(1));"

CMD ["node", "src/index.js"]
