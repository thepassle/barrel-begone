import fs from 'fs';
import path from 'path';
import { globbySync } from 'globby';
import * as resolve from 'resolve.exports';
import ts from 'typescript';
import { hasNamedExports, isReexport } from './ast/exports.js';

/**
 * @TODOS
 * - It would also be cool to crawl the module graph, and see how many imports a given entrypoint file will lead to. 
 *    E.g.: importing 'foo' leads to 100 other modules being imported
 *    We can probably use something similar to this for that: https://github.com/open-wc/custom-elements-manifest/blob/master/packages/find-dependencies/src/find-dependencies.js
 * - It would also be cool to see if an entrypoint imports from another barrel file, perhaps in a dependency, or even internally, like this example in MSW: https://github.com/mswjs/msw/pull/1987/files
 */

async function main({ cwd = process.cwd() } = {}) {
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8').toString());

  if (!packageJson.exports) {
    throw new Error(`package.json does not have a "exports" field`);
  }

  const files = gatherFilesFromPackageExports(packageJson.exports, { cwd });

  for (const file of files) {
    const filePath = path.join(cwd, file);
    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2015, true);
    const { exports, declarations } = analyze(source, filePath);

    if (exports > declarations) {
      console.log(`[WARNING] "${filePath}" is a barrel file.`);
    }
  }
}

/**
 * Count the amount of exports and declarations in a source file
 * If a file has more exports than declarations, its a barrel file
 */
function analyze(source, file) {
  let exports = 0;
  let declarations = 0;

  ts.forEachChild(source, (node) => {
    if (node.kind === ts.SyntaxKind.ExportDeclaration) {
      /**
       * @example export { var1, var2 };
       */
      if (hasNamedExports(node) && !isReexport(node)) {
        exports += node.exportClause?.elements?.length;
      }  
      /**
       * @example export * from 'foo';
       * @example export * from './my-module.js';
       */
      else if (isReexport(node) && !hasNamedExports(node)) {
        console.log(`[WARNING]: "${file}" reexports all exports from "${node.moduleSpecifier.text}", this should be avoided because it leads to unused imports, and makes it more difficult to tree-shake correctly.`);
        exports++;
      }

      /**
       * @example export { var1, var2 } from 'foo';
       * @example export { var1, var2 } from './my-module.js';
       */
      else if (isReexport(node) && hasNamedExports(node)) {
        exports += node.exportClause?.elements?.length;
      }
    }      
    /**
    * @example export default { var1, var };
    */
    else if (
      node.kind === ts.SyntaxKind.ExportAssignment && 
      node.expression.kind === ts.SyntaxKind.ObjectLiteralExpression
    ) {
      exports += node.expression.properties.length;
    }

    if (
      ts.isVariableStatement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node)
    ) {
      declarations++;
    }
  });

  return { exports, declarations };
}

/**
 * Gather all accessible files based on the "exports" object in package.json
 * @param {string | object} exports
 * @returns {string[]}
 */
function gatherFilesFromPackageExports(exports, { cwd }) {
  /**
   * @example "exports": "./index.js"
   */
  if (typeof exports === 'string') {
    return [exports];
  }

  /**
   * If a key doesn't start with a ".", then it's a condition
   * @example "exports": { "default": "./index.js" }
   */
  const isExportCondition = Object.keys(exports).every(key => !key.startsWith('.'));
  if (isExportCondition) {
    return resolve.exports({exports});
  }

  const filePaths = [];
  for (const [key, value] of Object.entries(exports)) {
    /**
     * @example "exports": { "./foo/*": null }
     */
    if (value === null) {
      continue;
    }
    /**
     * @example "exports": { "./foo/*": "./foo/bar/*.js" }
     */
    else if (key.includes('*')) {
      const placeholders = resolve.exports({exports}, key.replaceAll('*', '<PLACEHOLDER>'));
      for (const placeholder of placeholders) {
        const glob = placeholder.replaceAll('<PLACEHOLDER>', '*');
        const paths = globbySync(glob, { cwd });
        filePaths.push(...paths);
      }
    } else {
      filePaths.push(...resolve.exports({exports}, key));
    }
  }

  return filePaths;
}

main({
  cwd: path.join(process.cwd(), 'fixtures/barrel')
});