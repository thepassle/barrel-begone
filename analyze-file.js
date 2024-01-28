import ts from 'typescript';

const has = arr => Array.isArray(arr) && arr.length > 0;

/**
 * @example export { var1, var2 };
 */
function hasNamedExports(node) {
  if (has(node?.exportClause?.elements)) {
    return true;
  }
  return false;
}

/**
 * @example export { var1, var2 } from 'foo';
 */
function isReexport(node) {
  if (node?.moduleSpecifier !== undefined) {
    return true;
  }
  return false;
}

/** 
 * @example import {namedA, namedB} from 'foo'; 
 */
function hasNamedImport(node) {
  return has(node?.importClause?.namedBindings?.elements);
}

/** 
 * @example import * as name from './my-module.js'; 
 */
function hasAggregatingImport(node) {
  return !!node?.importClause?.namedBindings?.name && !hasNamedImport(node);
}

/**
 * Count the amount of exports and declarations in a source file
 * If a file has more exports than declarations, its a barrel file
 */
export function analyzeFile(source, file) {
  const diagnostics = [];
  let exports = 0;
  let declarations = 0;

  ts.forEachChild(source, (node) => {
    /**
     * @example import * as name from './my-module.js'; 
     */
    if (hasAggregatingImport(node)) {
      diagnostics.push({
        id: 'import-all',
        level: 'warning',
        message: `"${file}" contains an aggregating import, importing * from "${node.moduleSpecifier.text}", this should be avoided because it leads to unused imports, and makes it more difficult to tree-shake correctly.`,
        loc: {
          start: node.getStart(),
          end: node.getEnd(),
        }
      });
    }

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
        // @TODO do the same for import * as foo from 'foo'?
        diagnostics.push({
          level: 'warning',
          id: 're-export-all',
          message: `"${file}" re-exports all exports from "${node.moduleSpecifier.text}", this should be avoided because it leads to unused imports, and makes it more difficult to tree-shake correctly.`,
          loc: {
            start: node.getStart(),
            end: node.getEnd(),
          }
        });
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

  if(exports > declarations) {
    diagnostics.unshift({
      id: 'barrel-file',
      level: 'error',
      message: `"${file}" is a barrel file.`,
    });
  }

  return { diagnostics, exports, declarations };
}