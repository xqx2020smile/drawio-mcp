import assert from "node:assert/strict";
import test from "node:test";

import { buildHtml } from "../src/shared.js";


const html = buildHtml("/* app */", "/* pako */", "/* mermaid */", {
  buildId: "test-build",
});


test("MCP App 默认使用纯白浅色界面", function ()
{
  assert.match(html, /<html[^>]*class="fixed-light"/);
  assert.match(html, /color-scheme:\s*light;/);
  assert.doesNotMatch(html, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.match(html, /html\s*\{[^}]*background:\s*#ffffff;/s);
  assert.match(html, /body\s*\{[^}]*background:\s*#ffffff;/s);
  assert.match(html, /--viewer-card-bg:\s*#ffffff;/);
  assert.match(
    html,
    /#diagram-container \.mxgraph\s*\{[^}]*color-scheme:\s*light !important;[^}]*background:\s*#ffffff !important;/s,
  );
  assert.match(html, /html\.adaptive\s*\{[^}]*color-scheme:\s*light dark;/s);
  assert.match(html, /html\.fixed-dark\s*\{[^}]*color-scheme:\s*dark;/s);
});


test("XML 和 Mermaid 的流式与最终渲染共用颜色清洗器", function ()
{
  assert.match(html, /function normalizeColorModeWithDom/);
  assert.match(html, /healedXml = normalizeViewerDiagramXml\(healedXml, activeColorMode, activeSolidFill\)/);
  assert.match(html, /xml = normalizeViewerDiagramXml\(xml, activeColorMode, activeSolidFill\)/);
  assert.match(html, /applyViewerColorMode\(opts\.colorMode \|\| activeColorMode, opts\.solidFill === true\)/);
});
