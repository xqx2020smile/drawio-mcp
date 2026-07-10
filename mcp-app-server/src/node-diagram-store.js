import fs from "node:fs";
import path from "node:path";
import { MemoryDiagramStore } from "./diagram-store.js";

export class JsonFileDiagramStore extends MemoryDiagramStore
{
  constructor(filePath, options = {})
  {
    super(options);
    this.filePath = path.resolve(filePath);
    this.load();
  }

  load()
  {
    try
    {
      if (!fs.existsSync(this.filePath)) return;

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      this.importEntries(Array.isArray(parsed) ? parsed : parsed.entries);
    }
    catch (error)
    {
      console.warn("Could not load diagram store:", error.message);
    }
  }

  persist()
  {
    const directory = path.dirname(this.filePath);
    const temporaryPath = this.filePath + ".tmp";

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify({ entries: this.exportEntries() }, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
  }

  async put(id, value)
  {
    const entry = await super.put(id, value);
    this.persist();
    return entry;
  }

  async delete(id)
  {
    const deleted = await super.delete(id);

    if (deleted) this.persist();

    return deleted;
  }
}

export function createNodeDiagramStore()
{
  const options = {
    maxEntries: parseInt(process.env.DIAGRAM_STORE_MAX || "200", 10),
    ttlMs: parseInt(process.env.DIAGRAM_STORE_TTL_MS || String(7 * 24 * 60 * 60 * 1000), 10),
  };

  if (process.env.DIAGRAM_STORE_PATH)
  {
    console.log("Using persistent diagram store at", process.env.DIAGRAM_STORE_PATH);
    return new JsonFileDiagramStore(process.env.DIAGRAM_STORE_PATH, options);
  }

  console.log("Using in-memory diagram store");
  return new MemoryDiagramStore(options);
}
