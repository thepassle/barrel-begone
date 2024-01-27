import { test } from "node:test";
import assert from "node:assert";
import { createTeardown } from "fs-teardown";
import { flushImports } from "../flush-imports.js";

const fs = createTeardown({
  rootDir: "./flush-imports",
});

test.before(async () => {
  await fs.prepare();
});

test.beforeEach(async () => {
  await fs.reset();
});

test.after(async () => {
  await fs.cleanup();
});

test("returns an empty Set given entrypoint without any imports", async () => {
  await fs.create({
    "./empty.js": `export {}`,
  });
  assert.deepEqual(await flushImports(fs.resolve("empty.js")), new Set());
});

test("returns the set of imports from the given entrypoint", async () => {
  await fs.create({
    "./root.js": `import './child.js'`,
    "./child.js": `export {}`,
  });

  assert.deepEqual(
    await flushImports(fs.resolve("root.js")),
    new Set([
      {
        importPath: "./child.js",
        modulePath: fs.resolve("child.js"),
        importer: fs.resolve("root.js"),
      },
    ]),
  );
});

test("returns a Set of deeply nested imports", async () => {
  await fs.create({
    "./root.js": `import './child.js'`,
    "./child.js": `import './subchild.js'`,
    "./subchild.js": `export {}`,
  });

  assert.deepEqual(
    await flushImports(fs.resolve("root.js")),
    new Set([
      {
        importPath: "./child.js",
        modulePath: fs.resolve("child.js"),
        importer: fs.resolve("root.js"),
      },
      {
        importPath: "./subchild.js",
        modulePath: fs.resolve("subchild.js"),
        importer: fs.resolve("child.js"),
      },
    ]),
  );
});
