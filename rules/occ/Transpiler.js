const path = require("path");
const Files = require("./Files");
const rollup = require("rollup");
const babel = require("rollup-plugin-babel");
const nodeResolve = require("rollup-plugin-node-resolve");
const multiInput = require("rollup-plugin-multi-input").default;

// const uglify = require("rollup-plugin-uglify");
// const replace = require("rollup-plugin-replace");
// const livereload = require("rollup-plugin-livereload");

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
      let files, jsFiles;

      try {
        files = await new Files();
        jsFiles = await files.findFiles(["widgets", "app-level"], ["js"]);
      } catch (error) {
        console.log(error);
        reject(error);
        throw new Error(error);
      }

      const entries = jsFiles
        .filter(file => !/view-models|models|\.min/.test(file))
        .map(file => {
          let outputFile = "";
          const type = path
            .relative(this.config.storefrontPath, file)
            .split(path.sep)[0];

          if (type === "widgets") {
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
          } else {
            const appLevelSegments = path
              .relative(this.config.storefrontPath, file)
              .split(path.sep);

            outputFile = path.join(type, appLevelSegments[1]);
          }

          return {
            [outputFile]: file
          };
        });

      const inputOptions = {
        input: entries,
        external: id => {
          return /^((\/file)|(\/oe-files)|(?!\.{1}|occ-components|(.+:\\)|\/{1}[a-z-A-Z0-9_.]{1})).+?$/.test(
            id
          );
        },
        plugins: [
          multiInput(),
          resolver(),
          nodeResolve(),
          babel({
            exclude: "node_modules/**",
            plugins: [
              ["@babel/plugin-proposal-decorators", { legacy: true }],
              "@babel/plugin-proposal-class-properties"
            ]
          })
        ]
      };

      const outputOptions = {
        format: "amd",
        dir: path.join(this.config.storefrontPath, ".occ-transpiled")
      };

      function resolver() {
        return {
          name: "resolver", // this name will show up in warnings and errors
          resolveId(source) {
            if (source.startsWith("occ-components")) {
              return {
                id:
                  "/Users/douglashipolito/Sites/occ/motorola/storefront/.occ-components/widgets/" +
                  source.replace("occ-components", "") +
                  "/index.js",
                external: false
              };
            }
            return null; // other ids should be handled as usually
          }
        };
      }

      const bundle = await rollup.rollup(inputOptions);
      // const { output } = await bundle.generate(outputOptions);

      // or write the bundle to disk
      await bundle.write(outputOptions);
    });
  }
}

(async () => {
  const transpiler = await new Transpiler();
  await transpiler.js();
})();

process.stdin.resume();

module.exports = Transpiler;
