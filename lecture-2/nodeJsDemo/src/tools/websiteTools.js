import fs from "node:fs/promises";
import path from "node:path";

// Everything the website agent writes stays inside this directory.
export const websiteWorkspace = path.resolve(
  process.env.WEBSITE_WORKSPACE ?? "generated-sites",
);

const MAX_FILE_BYTES = 200_000;
const MAX_LISTED_ENTRIES = 200;

export function ensureWorkspace() {
  return fs.mkdir(websiteWorkspace, { recursive: true });
}

// The model chooses these paths, so treat them as untrusted input: only
// relative paths that resolve back inside the workspace are allowed.
function safePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new TypeError("A relative path inside the workspace is required");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error("Absolute paths are not allowed");
  }

  const resolved = path.resolve(websiteWorkspace, relativePath);
  if (
    resolved !== websiteWorkspace &&
    !resolved.startsWith(`${websiteWorkspace}${path.sep}`)
  ) {
    throw new Error("Paths outside the website workspace are not allowed");
  }
  return resolved;
}

const createDirectoryTool = {
  definition: {
    type: "function",
    name: "createDirectory",
    description:
      "Create a directory for a website project inside the website workspace.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative directory path, for example 'brewlab' or 'brewlab/assets'",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },

  async handler({ path: relativePath }) {
    console.log("createDirectory tool invoked:", { path: relativePath });
    await fs.mkdir(safePath(relativePath), { recursive: true });
    return `Directory created: ${relativePath}`;
  },
};

const writeFileTool = {
  definition: {
    type: "function",
    name: "writeFile",
    description:
      "Create or overwrite a text file inside the website workspace. Use this to write HTML, CSS and JavaScript files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative file path, for example 'brewlab/index.html'",
        },
        content: {
          type: "string",
          description: "The complete content to write into the file",
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },

  async handler({ path: relativePath, content }) {
    console.log("writeFile tool invoked:", { path: relativePath });
    if (typeof content !== "string") {
      throw new TypeError("File content must be a string");
    }
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      throw new RangeError(
        `File content is ${bytes} bytes, the limit is ${MAX_FILE_BYTES}. Split it into smaller files.`,
      );
    }

    const file = safePath(relativePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
    return `File written: ${relativePath} (${bytes} bytes)`;
  },
};

const readFileTool = {
  definition: {
    type: "function",
    name: "readFile",
    description:
      "Read an existing file from the website workspace, for example to review or fix a file that was already written.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path, for example 'brewlab/style.css'",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },

  async handler({ path: relativePath }) {
    console.log("readFile tool invoked:", { path: relativePath });
    return fs.readFile(safePath(relativePath), "utf8");
  },
};

const listFilesTool = {
  definition: {
    type: "function",
    name: "listFiles",
    description:
      "List the files and directories of a website project inside the website workspace.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative directory path, for example 'brewlab'. Use '.' for the whole workspace.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },

  async handler({ path: relativePath }) {
    console.log("listFiles tool invoked:", { path: relativePath });
    const directory = safePath(relativePath);

    const entries = [];
    async function walk(current) {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        if (entries.length >= MAX_LISTED_ENTRIES) return;
        const item = path.join(current, entry.name);
        entries.push(path.relative(websiteWorkspace, item));
        if (entry.isDirectory()) await walk(item);
      }
    }

    try {
      await walk(directory);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Directory does not exist: ${relativePath}`);
      }
      throw error;
    }

    return entries.length ? entries.join("\n") : `No files in ${relativePath}`;
  },
};

export const websiteTools = [
  createDirectoryTool,
  writeFileTool,
  readFileTool,
  listFilesTool,
];
