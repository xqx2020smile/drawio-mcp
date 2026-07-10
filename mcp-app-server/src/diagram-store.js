const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function clone(value)
{
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createDiagramId()
{
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
  {
    return globalThis.crypto.randomUUID();
  }

  return "diagram-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function isValidDiagramId(id)
{
  return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id);
}

export class MemoryDiagramStore
{
  constructor(options = {})
  {
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.entries = new Map();
  }

  cleanup()
  {
    const now = Date.now();

    for (const [id, entry] of this.entries.entries())
    {
      if (entry.expiresAt <= now)
      {
        this.entries.delete(id);
      }
    }

    if (this.entries.size <= this.maxEntries) return;

    const ordered = Array.from(this.entries.entries())
      .sort(function(a, b) { return a[1].updatedAt - b[1].updatedAt; });

    while (ordered.length > this.maxEntries)
    {
      const oldest = ordered.shift();
      this.entries.delete(oldest[0]);
    }
  }

  async put(id, value)
  {
    this.cleanup();

    const previous = this.entries.get(id);
    const now = Date.now();
    const entry = Object.assign({}, clone(value),
    {
      id,
      version: previous ? previous.version + 1 : 1,
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now,
      expiresAt: now + this.ttlMs,
    });

    this.entries.set(id, entry);
    this.cleanup();
    return clone(entry);
  }

  async get(id)
  {
    this.cleanup();
    const entry = this.entries.get(id);

    if (!entry) return null;

    entry.expiresAt = Date.now() + this.ttlMs;
    return clone(entry);
  }

  async list()
  {
    this.cleanup();

    return Array.from(this.entries.values())
      .sort(function(a, b) { return b.updatedAt - a.updatedAt; })
      .map(function(entry)
      {
        return {
          id: entry.id,
          name: entry.name || null,
          format: entry.format,
          version: entry.version,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          expiresAt: entry.expiresAt,
        };
      });
  }

  async delete(id)
  {
    return this.entries.delete(id);
  }

  exportEntries()
  {
    this.cleanup();
    return Array.from(this.entries.values()).map(clone);
  }

  importEntries(entries)
  {
    this.entries.clear();

    for (const entry of entries || [])
    {
      if (entry && isValidDiagramId(entry.id))
      {
        this.entries.set(entry.id, clone(entry));
      }
    }

    this.cleanup();
  }
}
