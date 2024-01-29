import ts from "typescript";
import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { analyzeFile } from "./analyze-file.js";
import { bold, underline } from "kleur/colors";

function format(arrayOfArrays) {
  let result = "";

  arrayOfArrays.forEach((subArray, i) => {
    subArray.forEach((element, index) => {
      if (index == 0) {
        result += bold(`\n    - #${i+1}: ${element}\n`);
      } else {
        result += "          "+" ".repeat(2 * index) + element + "\n";
      }
    });
    // result += "\n";
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
          message: `"${underline(bold(context.currentFile))}" leads to a module graph of ${bold(graphSize)} modules, which is more than the allowed maxModuleGraphSize of ${bold(context.options.maxModuleGraphSize)}.`,
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

          const message = context.options.info 
            ? `It is imported by ${bold(importChains.length)} modules, via the following import chains: \n${format(importChains)}\n`
            : `          It is imported by ${bold(importChains.length)} modules, to display the import chains, run with the ${bold("--info")} flag.`;

          diagnostics[context.currentFile].push({
            id: "barrel-file",
            level: "error",
            data: importChains,
            message: `"${
              underline(bold(context.currentFile))
            }" leads to an import for "${underline(bold(barrelFile))}", which is a barrel file. 
  ${message}`,
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
    ...context.options.rollup,
    plugins: [
      ...(context.options.rollup?.plugins || []),
      nodeResolve(), 
      analyzeModuleGraphPlugin(context, diagnostics)
    ],
  });
}
