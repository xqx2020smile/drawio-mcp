import { DOMParser, XMLSerializer } from "@xmldom/xmldom";


export const DEFAULT_COLOR_MODE = "fixed-light";
export const COLOR_MODES = ["adaptive", "fixed-light", "fixed-dark"];


export function normalizeColorModeWithDom(
  xml,
  colorMode,
  solidFill,
  DOMParserImpl,
  XMLSerializerImpl,
)
{
  function splitStyle(style)
  {
    return String(style || "")
      .split(";")
      .map(function(part) { return part.trim(); })
      .filter(function(part) { return part.length > 0; })
      .map(function(part)
      {
        var separator = part.indexOf("=");

        if (separator < 0)
        {
          return { name: null, value: null, raw: part };
        }

        return {
          name: part.substring(0, separator).trim(),
          value: part.substring(separator + 1).trim(),
          raw: null,
        };
      });
  }

  function serializeStyle(entries)
  {
    if (entries.length === 0) return "";

    return entries.map(function(entry)
    {
      return entry.name == null ? entry.raw : entry.name + "=" + entry.value;
    }).join(";") + ";";
  }

  function findStyleEntry(entries, name)
  {
    var expected = name.toLowerCase();

    for (var i = entries.length - 1; i >= 0; i--)
    {
      if (entries[i].name != null && entries[i].name.toLowerCase() === expected)
      {
        return entries[i];
      }
    }

    return null;
  }

  function setStyleValue(entries, name, value)
  {
    var entry = findStyleEntry(entries, name);

    if (entry)
    {
      entry.value = value;
    }
    else
    {
      entries.push({ name: name, value: value, raw: null });
    }
  }

  function setDefaultColor(entries, name, value)
  {
    var entry = findStyleEntry(entries, name);

    if (!entry || String(entry.value).toLowerCase() === "default")
    {
      setStyleValue(entries, name, value);
    }
  }

  function resolveLightDark(value, useDark)
  {
    var output = String(value);
    var searchFrom = 0;

    while (searchFrom < output.length)
    {
      var lower = output.toLowerCase();
      var start = lower.indexOf("light-dark(", searchFrom);

      if (start < 0) break;

      var contentStart = start + "light-dark(".length;
      var depth = 1;
      var separator = -1;
      var end = -1;

      for (var i = contentStart; i < output.length; i++)
      {
        var character = output.charAt(i);

        if (character === "(")
        {
          depth++;
        }
        else if (character === ")")
        {
          depth--;

          if (depth === 0)
          {
            end = i;
            break;
          }
        }
        else if (character === "," && depth === 1 && separator < 0)
        {
          separator = i;
        }
      }

      if (separator < 0 || end < 0)
      {
        throw new Error("无效的 light-dark() 颜色表达式。");
      }

      var lightValue = output.substring(contentStart, separator).trim();
      var darkValue = output.substring(separator + 1, end).trim();
      var replacement = useDark ? darkValue : lightValue;
      output = output.substring(0, start) + replacement + output.substring(end + 1);
      searchFrom = start + replacement.length;
    }

    return output;
  }

  if (["adaptive", "fixed-light", "fixed-dark"].indexOf(colorMode) < 0)
  {
    throw new Error("不支持的颜色模式：" + colorMode);
  }

  if (colorMode === "adaptive" && !solidFill)
  {
    return xml;
  }

  if (typeof DOMParserImpl !== "function" || typeof XMLSerializerImpl !== "function")
  {
    throw new Error("当前环境不支持 XML 颜色清洗。");
  }

  var parseErrors = [];
  var parser = new DOMParserImpl({
    onError: function(level, message)
    {
      if (level !== "warning") parseErrors.push(message);
    },
  });
  var documentNode;

  try
  {
    documentNode = parser.parseFromString(xml, "text/xml");
  }
  catch (error)
  {
    throw new Error("无效的 draw.io XML，无法执行颜色清洗。");
  }
  var parserErrors = documentNode && documentNode.getElementsByTagName
    ? documentNode.getElementsByTagName("parsererror")
    : [];

  if (!documentNode || !documentNode.documentElement || parseErrors.length > 0 || parserErrors.length > 0)
  {
    throw new Error("无效的 draw.io XML，无法执行颜色清洗。");
  }

  var models = documentNode.getElementsByTagName("mxGraphModel");

  if (models.length === 0)
  {
    throw new Error("固定颜色模式要求未压缩的 mxGraphModel，无法处理压缩 mxfile。");
  }

  var fixed = colorMode !== "adaptive";
  var useDark = colorMode === "fixed-dark";

  if (fixed)
  {
    for (var modelIndex = 0; modelIndex < models.length; modelIndex++)
    {
      models[modelIndex].setAttribute("adaptiveColors", "none");
      models[modelIndex].setAttribute("background", useDark ? "#1e1e1e" : "#ffffff");
    }
  }

  var cells = documentNode.getElementsByTagName("mxCell");

  for (var cellIndex = 0; cellIndex < cells.length; cellIndex++)
  {
    var cell = cells[cellIndex];
    var isVertex = cell.getAttribute("vertex") === "1";
    var isEdge = cell.getAttribute("edge") === "1";

    if (!isVertex && !isEdge) continue;

    var entries = splitStyle(cell.getAttribute("style") || "");

    if (fixed)
    {
      for (var styleIndex = 0; styleIndex < entries.length; styleIndex++)
      {
        if (entries[styleIndex].name != null)
        {
          entries[styleIndex].value = resolveLightDark(entries[styleIndex].value, useDark);
        }
      }

      if (isVertex)
      {
        setDefaultColor(entries, "fillColor", useDark ? "#2d2d2d" : "#ffffff");
        setDefaultColor(entries, "strokeColor", useDark ? "#a0a0a0" : "#666666");
        setDefaultColor(entries, "fontColor", useDark ? "#f5f5f5" : "#000000");
      }

      if (isEdge)
      {
        setDefaultColor(entries, "strokeColor", useDark ? "#b0b0b0" : "#666666");
        setDefaultColor(entries, "fontColor", useDark ? "#f5f5f5" : "#000000");
      }
    }

    if (solidFill)
    {
      setStyleValue(entries, "gradientColor", "none");
      setStyleValue(entries, "glass", "0");
      setStyleValue(entries, "opacity", "100");
      setStyleValue(entries, "fillOpacity", "100");
    }

    cell.setAttribute("style", serializeStyle(entries));
  }

  return new XMLSerializerImpl().serializeToString(documentNode);
}


export function normalizeColorMode(xml, colorMode = DEFAULT_COLOR_MODE, solidFill = false)
{
  return normalizeColorModeWithDom(
    xml,
    colorMode,
    solidFill,
    DOMParser,
    XMLSerializer,
  );
}
