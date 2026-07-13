import assert from "node:assert/strict";
import test from "node:test";

import { prepareDiagramInput } from "../src/diagram-tools.js";
import { normalizeColorMode } from "../src/normalize-color-mode.js";


const ADAPTIVE_XML = `
<mxGraphModel adaptiveColors="auto" background="#000000">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Test"
      style="rounded=1;fillColor=light-dark(#ffffff,#111111);fontColor=default;gradientColor=#eeeeee;glass=1;opacity=60;fillOpacity=70;"
      vertex="1" parent="1">
      <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="3" value="Transparent" style="fillColor=none;fontColor=default;" vertex="1" parent="1">
      <mxGeometry x="120" y="0" width="100" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="4" edge="1" parent="1" source="2" target="3">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;


test("fixed-light 清除自适应颜色并补齐确定性浅色", function ()
{
  const output = normalizeColorMode(ADAPTIVE_XML, "fixed-light", false);

  assert.match(output, /adaptiveColors="none"/);
  assert.match(output, /background="#ffffff"/);
  assert.doesNotMatch(output, /light-dark\(/);
  assert.match(output, /fillColor=#ffffff/);
  assert.match(output, /fontColor=#000000/);
  assert.match(output, /strokeColor=#666666/);
  assert.match(output, /fillColor=none/);
});


test("solidFill 关闭渐变、玻璃和透明效果", function ()
{
  const output = normalizeColorMode(ADAPTIVE_XML, "fixed-light", true);

  assert.match(output, /gradientColor=none/);
  assert.match(output, /glass=0/);
  assert.match(output, /opacity=100/);
  assert.match(output, /fillOpacity=100/);
  assert.match(output, /fillColor=none/);
});


test("fixed-dark 能解析包含嵌套函数的 light-dark 颜色", function ()
{
  const xml = ADAPTIVE_XML.replace(
    "light-dark(#ffffff,#111111)",
    "light-dark(rgb(255, 255, 255),rgb(30, 30, 30))",
  );
  const output = normalizeColorMode(xml, "fixed-dark", false);

  assert.match(output, /background="#1e1e1e"/);
  assert.match(output, /fillColor=rgb\(30, 30, 30\)/);
  assert.match(output, /fontColor=#f5f5f5/);
  assert.doesNotMatch(output, /light-dark\(/);
});


test("adaptive 且非纯色模式保持原 XML 不变", function ()
{
  assert.equal(normalizeColorMode(ADAPTIVE_XML, "adaptive", false), ADAPTIVE_XML);
});


test("fixed-light 支持未压缩 mxfile", function ()
{
  const xml = `<mxfile><diagram id="page-1">${ADAPTIVE_XML}</diagram></mxfile>`;
  const output = normalizeColorMode(xml, "fixed-light", false);

  assert.match(output, /adaptiveColors="none"/);
  assert.match(output, /background="#ffffff"/);
});


test("fixed 模式拒绝无法清洗的压缩 mxfile", function ()
{
  assert.throws(
    function ()
    {
      normalizeColorMode("<mxfile><diagram>compressed-data</diagram></mxfile>", "fixed-light", false);
    },
    /未压缩的 mxGraphModel/,
  );
});


test("拒绝未知颜色模式和损坏的 XML", function ()
{
  assert.throws(function ()
  {
    normalizeColorMode(ADAPTIVE_XML, "unknown", false);
  }, /不支持的颜色模式/);

  assert.throws(function ()
  {
    normalizeColorMode("<mxGraphModel><root>", "fixed-light", false);
  }, /无效的 draw.io XML/);
});


test("服务端写入入口在保存前清洗 XML", function ()
{
  const prepared = prepareDiagramInput(ADAPTIVE_XML, undefined, "fixed-light", true);

  assert.equal(prepared.format, "xml");
  assert.doesNotMatch(prepared.content, /light-dark\(/);
  assert.match(prepared.content, /background="#ffffff"/);
  assert.match(prepared.content, /gradientColor=none/);
});


test("Mermaid 写入入口保留源码并由 Viewer 按模式转换", function ()
{
  assert.deepEqual(
    prepareDiagramInput(undefined, "flowchart TD\n  A --> B", "fixed-light", false),
    { format: "mermaid", content: "flowchart TD\n  A --> B" },
  );
});
