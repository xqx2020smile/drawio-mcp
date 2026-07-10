import assert from "node:assert/strict";
import test from "node:test";

import { buildHtml } from "../src/shared.js";


const html = buildHtml("/* app */", "/* pako */", "/* mermaid */", {
  buildId: "test-build",
});


test("MCP App 始终使用纯白浅色界面", function ()
{
  assert.match(html, /color-scheme:\s*light;/);
  assert.doesNotMatch(html, /color-scheme:\s*light dark/);
  assert.doesNotMatch(html, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(html, /html\s*\{[^}]*background:\s*#ffffff;/s);
  assert.match(html, /body\s*\{[^}]*background:\s*#ffffff;/s);
  assert.match(html, /--viewer-card-bg:\s*#ffffff;/);
  assert.match(
    html,
    /#diagram-container \.mxgraph\s*\{[^}]*color-scheme:\s*light !important;[^}]*background:\s*#ffffff !important;/s,
  );
});


test("渲染前关闭 Draw.io 自动颜色转换并固定画布为白色", function ()
{
  assert.match(html, /setAttribute\('adaptiveColors', 'none'\)/);
  assert.match(html, /setAttribute\('background', '#ffffff'\)/);
  assert.match(html, /xml = enforceLightDiagramXml\(xml\);/);
});
