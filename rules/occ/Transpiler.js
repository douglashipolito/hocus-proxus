const path = require("path");
const fs = require("fs-extra");
const Files = require("./helpers/Files");
const rollup = require("rollup");
const babel = require("rollup-plugin-babel");
const nodeResolve = require("rollup-plugin-node-resolve");
const multiInput = require("rollup-plugin-multi-input").default;
const progress = require("rollup-plugin-progress");

/**
 * Create the index file containing the app level
 * dependencies
 * @param  {Array} filesList each file
 * @return {String}           the index file content
 */
function createJsBundleIndexFile(filesList, appLevelIndexTemplate) {
  var dependenciesImports = [];
  var allDependencies = [];
  var dependenciesApp = [];

  filesList.forEach(function(file) {
    var fileName = path.basename(file, ".js").replace(/[\W]/g, "_");

    dependenciesImports.push("import " + fileName + " from '" + file + "';");
    allDependencies.push(fileName);
    dependenciesApp.push("app['" + fileName + "'] = " + fileName + ";");
  });

  dependenciesImports = dependenciesImports.join("\n");
  allDependencies = allDependencies.join(",");
  dependenciesApp = dependenciesApp.join("\n");

  appLevelIndexTemplate = appLevelIndexTemplate.replace(
    /#dependenciesImports/g,
    dependenciesImports
  );
  appLevelIndexTemplate = appLevelIndexTemplate.replace(
    /#allDependencies/g,
    allDependencies
  );
  appLevelIndexTemplate = appLevelIndexTemplate.replace(
    /#dependenciesApp/g,
    dependenciesApp
  );

  return appLevelIndexTemplate;
}

class Transpiler {
  constructor() {
    return new Promise(async (resolve, reject) => {
      try {
        this.config = await require("./config")();
        resolve(this);
      } catch (error) {
        console.log(error);
        reject(error);
        throw new Error(error);
      }
    });
  }

  js() {
    return new Promise(async (resolve, reject) => {
      let files, widgetsFiles, appLevelFiles, appLevelIndexTemplate;

      try {
        files = await new Files();
        widgetsFiles = await files.findFiles(["widgets"], ["js"]);
        appLevelFiles = await files.findFiles(["app-level"], ["js"]);
        appLevelIndexTemplate = await fs.readFile(
          path.join(__dirname, "templates", "app-level-index.js"),
          "utf8"
        );
      } catch (error) {
        console.log(error);
        reject(error);
        throw new Error(error);
      }

      const entries = widgetsFiles
        .filter(file => !/view-models|models|\.min/.test(file))
        .map(file => {
          let outputFile = "";
          const type = path
            .relative(this.config.storefrontPath, file)
            .split(path.sep)[0];
          const widgetSegments = path
            .relative(this.config.storefrontPath, file)
            .split(path.sep);
          const widgetName = widgetSegments[2];

          if (/element/.test(file)) {
            outputFile = path.join(
              type,
              widgetName,
              "element",
              widgetSegments[4],
              path.basename(file, ".js")
            );
          } else {
            outputFile = path.join(
              type,
              widgetName,
              path.basename(file, ".js")
            );
          }

          return {
            [outputFile]: file
          };
        });

      entries.push({
        [path.join("app-level", "oeCore")]: "oeCore.js"
      });

      entries.push({
        [path.join("app-level", "oeLibs")]: "oeLibs.js"
      });

      const resolver = () => {
        return {
          name: "resolver", // this name will show up in warnings and errors
          resolveId: source => {
            if (source.startsWith("occ-components")) {
              return {
                id: path.join(
                  this.config.storefrontPath,
                  ".occ-components",
                  "widgets",
                  source.replace("occ-components", ""),
                  "index.js"
                ),
                external: false
              };
            }

            if (/oeCore\.js|oeLibs\.js/.test(source)) {
              return source;
            }

            return null; // other ids should be handled as usually
          },
          load(id) {
            if (/oeCore\.js|oeLibs\.js/.test(id)) {
              return createJsBundleIndexFile(
                appLevelFiles.filter(file =>
                  new RegExp(id.replace(".js", "")).test(file)
                ),
                appLevelIndexTemplate
              );
            }
            return null; // other ids should be handled as usually
          }
        };
      };

      const inputOptions = {
        input: entries,
        external: id => {
          return /^((\/file)|(\/oe-files)|(?!\.{1}|occ-components|(.+:\\)|\/{1}[a-z-A-Z0-9_.]{1})).+?$/.test(
            id
          );
        },
        onwarn(warning, warn) {
          // skip certain warnings
          if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;

          // throw on others
          if (warning.code === "NON_EXISTENT_EXPORT")
            throw new Error(warning.message);

          // Use default for everything else
          warn(warning);
        },
        plugins: [
          progress(),
          multiInput(),
          resolver(),
          nodeResolve(),
          babel({
            exclude: "node_modules/**",
            plugins: [
              [
                path.join(
                  __dirname,
                  "node_modules",
                  "@babel/plugin-proposal-decorators"
                ),
                { legacy: true }
              ],
              path.join(
                __dirname,
                "node_modules",
                "@babel/plugin-proposal-class-properties"
              )
            ]
          })
        ]
      };

      const outputOptions = {
        format: "amd",
        dir: this.config.transpiledFolder,
        sourceMap: "inline"
      };

      console.log("Starting Transpilers...");
      const watcher = rollup.watch({
        ...inputOptions,
        output: [outputOptions]
      });

      watcher.on("event", event => {
        if (event.code === "END") {
          resolve();
        }
      });
    });
  }
}

exports.preprocessors = {
  async shouldResolve() {
    return true;
  },
  async resolve() {
    const transpiler = await new Transpiler();

    try {
      await transpiler.js();
    } catch (error) {
      Promise.reject(error);
    }

    return true;
  }
};
