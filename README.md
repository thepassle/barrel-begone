# Barrel Begone

Barrel files are files that just re-export a bunch of things from other files. If you're using a bundler, bundlers usually apply treeshaking and dead code elimination algorithms to remove any unused code.

In many environments however, like test runners, browsers, CDN environments or server side JavaScript runtimes, treeshaking does not get applied. This means that lots of modules get loaded unnecessarily, which can cause significant performance slowdowns. Additionally, not all types of imports and exports can effectively be treeshaken.

`Barrel Begone` will analyze your packages entrypoints, and analyze your code and warn for various different things:

- The total amount of modules loaded by importing the entrypoint
- Whether a file is a barrel or not
- Whether `export *` is used, which leads to poor or no treeshaking
- Whether `import *` is used, which leads to poor or no treeshaking
- Whether an entrypoint leads to a barrel file somewhere down in your module graph

For more information, I recommend reading [Speeding up the JavaScript ecosystem - The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/).

## Usage

```
npx barrel-begone
```

## Configuration

### Cli options

| Command/option                              | Type       | Description                                                         | Example                                               |
| ------------------------------------------- | ---------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `--cwd`                                     | string     | Defaults to `process.cwd()`                                         | `--cwd "/Foo/bar"`                                    |
| `--maxModuleGraphSize`                      | number     | The max amount of modules allowed in the graph                      | `--maxModuleGraphSize 20`                             |
| `--amountOfExportsToConsiderModuleAsBarrel` | number     | The amount of exports to consider a module as barrel file           | `--amountOfExportsToConsiderModuleAsBarrel 10`        |
| `--info`                                    | boolean    | Enable extra logging                                                | `--info`                                              |

### Config file

`my-project/barrel-begone.config.js`:
```js
export default {
  cwd: process.cwd(),
  maxModuleGraphSize: 20,
  amountOfExportsToConsiderModuleAsBarrel: 5,
  info: true,
  rollup: {
    plugins: [myPlugin()]
  }
}
```

### Programmatic usage

The analyzer can also be imported via javascript and uses programmatically:

```js
import { barrelBegone } from 'barrel-begone';

const diagnostics = await barrelBegone({
  cwd: process.cwd(),
  maxModuleGraphSize: 10,
  amountOfExportsToConsiderModuleAsBarrel: 3,
  info: true,
  rollup: {
    plugins: [myPlugin()]
  }
});
```
