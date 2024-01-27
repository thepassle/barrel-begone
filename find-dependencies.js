import fs from 'fs';
import path from 'path';
import { createRequire, builtinModules } from 'module';
import { init, parse } from 'es-module-lexer';
import * as resolve from 'resolve.exports';

import {
  isBareModuleSpecifier,
  splitPath,
  traverseUp,
  extractPackageNameFromSpecifier
} from './utils.js';

const require = createRequire(import.meta.url);

function resolveBareModuleSpecifier(specifier, { cwd }) {
  let resolved;
  const packageName = extractPackageNameFromSpecifier(specifier);
  const packageJsonPath = path.join(cwd, 'node_modules', packageName, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (packageJson.exports) {
    const result = resolve.exports(packageJson, specifier);
    resolved = path.join(cwd, 'node_modules', packageName, result[0]);
  } else {
    resolved = resolve.legacy(specifier);
  }

  return resolved;
}

/**
 *
 * @param {string[]} paths
 * @param {{
 *  nodeModulesDepth?: number,
 *  basePath?: string,
 * }} options
 * @returns {Promise<string[]>}
 */
export async function findDependencies(paths, options = {}) {
  const importsToScan = new Set();
  const dependencies = new Set();

  const nodeModulesDepth = options?.nodeModulesDepth ?? 3;
  const cwd = options?.cwd ?? process.cwd();

  /** Init es-module-lexer wasm */
  await init;

  paths.forEach(p => {
    const source = fs.readFileSync(p).toString();
    const [imports] = parse(source);

    imports?.forEach(i => {
      let specifier = i.n;

      /** Skip built-in modules like fs, path, etc */
      if(builtinModules.includes(i.n)) return;
      if(isBareModuleSpecifier(i.n)) {
        specifier = resolveBareModuleSpecifier(i.n, { cwd });
        if (!specifier) {
          specifier = i.n;
        }
      }

      try {
        const pathToDependency = require.resolve(specifier, {paths: [
          /** 
           * If it's a bare module specifier, we need to resolve it relative to the basepath 
           * but if it's a local import, we need to resolve relative to the parent module
           */
          ...(!isBareModuleSpecifier(i.n) ? [path.dirname(p)] : []),
          /** Current project's node_modules */
          cwd,
          /** Monorepo, look upwards in filetree n times */
          ...traverseUp(nodeModulesDepth, { cwd })
        ]});

        importsToScan.add(pathToDependency);
        dependencies.add(pathToDependency);
      } catch (e) {
        console.log(111, e);

        console.log(`Failed to resolve dependency "${i.n}".`, e.stack);
      }
    });
  });

  while(importsToScan.size) {
    importsToScan.forEach(dep => {
      importsToScan.delete(dep);

      const source = fs.readFileSync(dep).toString();
      const [imports] = parse(source);

      imports?.forEach(i => {
        let specifier = isBareModuleSpecifier(i.n) ? i.n : path.join(path.dirname(dep), i.n);
        /** Skip built-in modules like fs, path, etc */
        if(builtinModules.includes(i.n)) return;
        if(isBareModuleSpecifier(i.n)) {
          specifier = resolveBareModuleSpecifier(i.n, { cwd });
          if (!specifier) {
            specifier = i.n;
          }
        }

        try {
          const { packageRoot } = splitPath(dep);

          /**
           * First check in the dependencies' node_modules, then in the project's node_modules,
           * then up, and up, and up
           */
          const pathToDependency = require.resolve(specifier, {paths: [
            /** Nested node_modules */
            packageRoot,
            /** Current project's node_modules */
            cwd,
            /** Monorepo, look upwards in filetree n times */
            ...traverseUp(nodeModulesDepth, { cwd })
          ]});

          /**
           * Don't add dependencies we've already scanned, also avoids circular dependencies
           * and multiple modules importing from the same module
           */
          if(!dependencies.has(pathToDependency)) {
            importsToScan.add(pathToDependency);
            dependencies.add(pathToDependency);
          }
        } catch(e) {
          console.log(222, e);

          console.log(`Failed to resolve dependency "${i.n}".`, e.stack);
        }
      });
    });
  }

  return [...dependencies];
}