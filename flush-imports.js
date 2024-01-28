import { rollup } from "rollup";

/**
 * @param {Set<string>} resultSet
 * @returns {Plugin}
 */
function rollupImportAnalyzerPlugin(resultSet) {
  let buildOptions;
  return {
    name: "import-analyzer",
    buildStart(options) {
      buildOptions = options;
    },
    async resolveId(source, importer) {
      const resolvedModule = await this.resolve(source, importer);

      if (!buildOptions.input.includes(source)) {
        resultSet.add({
          importPath: source,
          modulePath: resolvedModule.id,
          importer,
        });
      }

      return resolvedModule.id;
    },
  };
}

/**
 * @param {string} entrypoint
 * @return {Promise<Set<string>>}
 */
export async function flushImports(entrypoint) {
  const imports = new Set();

  await rollup({
    input: entrypoint,
    plugins: [rollupImportAnalyzerPlugin(imports)],
  });

  return imports;
}
