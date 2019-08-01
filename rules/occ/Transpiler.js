const path = require("path");
const Files = require("./Files");
const rollup = require("rollup");
const babel = require("rollup-plugin-babel");
const nodeResolve = require("rollup-plugin-node-resolve");
// const uglify = require("rollup-plugin-uglify");
// const replace = require("rollup-plugin-replace");
// const livereload = require("rollup-plugin-livereload");

async function bundler() {
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

  const inputOptions = {
    input:
      "/Users/douglashipolito/Sites/occ/motorola/storefront/widgets/objectedge/oeCartB2BContractSelector/js/index.js",
    external: id => {
      return /^((\/file)|(\/oe-files)|(?!\.{1}|occ-components|(.+:\\)|\/{1}[a-z-A-Z0-9_.]{1})).+?$/.test(
        id
      );
    },
    plugins: [
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
    file: "./test.js",
    format: "amd"
  };

  // create a bundle
  const bundle = await rollup.rollup(inputOptions);

  console.log(bundle.watchFiles); // an array of file names this bundle depends on

  // generate code
  const { output } = await bundle.generate(outputOptions);

  for (const chunkOrAsset of output) {
    if (chunkOrAsset.isAsset) {
      // For assets, this contains
      // {
      //   isAsset: true,                 // signifies that this is an asset
      //   fileName: string,              // the asset file name
      //   source: string | Buffer        // the asset source
      // }
      console.log("Asset", chunkOrAsset);
    } else {
      // For chunks, this contains
      // {
      //   code: string,                  // the generated JS code
      //   dynamicImports: string[],      // external modules imported dynamically by the chunk
      //   exports: string[],             // exported variable names
      //   facadeModuleId: string | null, // the id of a module that this chunk corresponds to
      //   fileName: string,              // the chunk file name
      //   imports: string[],             // external modules imported statically by the chunk
      //   isDynamicEntry: boolean,       // is this chunk a dynamic entry point
      //   isEntry: boolean,              // is this chunk a static entry point
      //   map: string | null,            // sourcemaps if present
      //   modules: {                     // information about the modules in this chunk
      //     [id: string]: {
      //       renderedExports: string[]; // exported variable names that were included
      //       removedExports: string[];  // exported variable names that were removed
      //       renderedLength: number;    // the length of the remaining code in this module
      //       originalLength: number;    // the original length of the code in this module
      //     };
      //   },
      //   name: string                   // the name of this chunk as used in naming patterns
      // }
      console.log("Chunk", chunkOrAsset.code);
    }
  }

  // or write the bundle to disk
  // await bundle.write(outputOptions);
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
      let files, jsFiles;

      try {
        files = await new Files();
        jsFiles = await files.findFiles(["widgets", "app-level"], ["js"]);
      } catch (error) {
        console.log(error);
        reject(error);
        throw new Error(error);
      }

      // const es6entries = jsFiles.filter(file => file.endsWith(path.join("js", "index.js")));
      console.log(
        // jsFiles.filter(file => file.endsWith(path.join("js", "index.js"))),
        jsFiles.filter(file => !file.endsWith("index.js"))
      );
    });
  }
}

(async () => {
  const transpiler = await new Transpiler();
  await transpiler.js();
})();

process.stdin.resume();

module.exports = Transpiler;
