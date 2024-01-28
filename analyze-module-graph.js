import ts from "typescript";
import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { analyzeFile } from "./analyze-file.js";
import { bold } from "kleur/colors";

function format(arrayOfArrays) {
  let result = "";

  arrayOfArrays.forEach((subArray, i) => {
    subArray.forEach((element, index) => {
      result += " ".repeat(2 * index) + (index == 0 ? bold(`#${i+1}: ${element}`) : element) + "\n";
    });
    result += "\n";
  });

  return result.trim();
}

export default function analyzeModuleGraphPlugin(context, diagnostics) {
  const barrelFiles = [];

  return {
    name: "analyze-module-graph",
    transform(code, id) {
      const source = ts.createSourceFile(
        id,
        code,
        ts.ScriptTarget.ES2015,
        true
      );

      const { diagnostics: fileDiagnostics } = analyzeFile(
        source,
        id,
        {
          amountOfExportsToConsiderModuleAsBarrel: context.options.amountOfExportsToConsiderModuleAsBarrel,
        }
      );
      if (fileDiagnostics.find((d) => d.id === "barrel-file")) {
        if (id !== context.currentFile) {
          barrelFiles.push(id);
        }
      }
    },

    buildEnd() {
      const moduleInfoMap = new Map();
      const moduleIds = Array.from(this.getModuleIds());
      const graphSize = moduleIds.length;

      if (graphSize > context.options.maxModuleGraphSize) {
        diagnostics[context.currentFile].unshift({
          id: "module-graph-size",
          level: "error",
          message: `"${context.currentFile}" leads to a module graph of ${graphSize} modules, which is more than the allowed maxModuleGraphSize of ${context.options.maxModuleGraphSize}.`,
        });
      }

      // Map all modules by their IDs
      for (const moduleId of moduleIds) {
        moduleInfoMap.set(moduleId, this.getModuleInfo(moduleId));
      }

      const traceImports = (moduleId, chain = []) => {
        const moduleInfo = moduleInfoMap.get(moduleId);
        if (moduleInfo && moduleInfo.importers.length) {
          return moduleInfo.importers.flatMap((importer) =>
            traceImports(importer, [moduleId, ...chain])
          );
        }
        return [[moduleId, ...chain]];
      };

      barrelFiles.forEach((barrelFile) => {
        if (moduleInfoMap.has(barrelFile)) {
          const importChains = traceImports(barrelFile);
          diagnostics[context.currentFile].push({
            id: "barrel-file",
            level: "error",
            data: importChains,
            message: `"${
              context.currentFile
            }" leads to an import for "${barrelFile}", which is a barrel file. 
  It is imported by ${importChains.length} modules, via the following import chains: \n\n${format(importChains)}\n`,
          });
        }
      });
    },
  };
}

export async function analyzeModuleGraph(entrypoint, context, diagnostics) {
  await rollup({
    input: entrypoint,
    onLog(level, log, handler) {
      if (!['THIS_IS_UNDEFINED'].includes(log.code)) {
        handler(level, log);
      }
    },  
    plugins: [nodeResolve(), analyzeModuleGraphPlugin(context, diagnostics)],
  });
}
