const globby = require("globby");
const path = require("path");
const cache = [];

class Files {
  constructor() {
    return new Promise(async (resolve, reject) => {
      let config;
      try {
        config = await require("../config")();
      } catch (error) {
        reject(error);
        throw new Error("Error on loading configs");
      }

      this.config = config;
      resolve(this);
    });
  }

  fileName(path, extension = "js") {
    let match = path.match(new RegExp(`v.+\/(.+)\.${extension}`)) || "";

    if (match) {
      match = match[1].replace(/\.min/, '');
    }

    return match;
  }

  findFiles(paths, filter = [], basePath) {
    return new Promise(async (resolve, reject) => {
      let foundFiles;

      paths = paths.map(currentPath =>
        path.join(basePath || this.config.storefrontPath, currentPath)
      );

      const foundCache = cache.find(
        cache =>
          Object.keys(cache).includes(paths) &&
          cache.filter === filter.join(",")
      );
      if (foundCache) {
        return resolve(foundCache);
      }

      try {
        foundFiles = await globby(paths, {
          expandDirectories: {
            extensions: filter
          }
        });
      } catch (error) {
        reject(error);
        throw new Error(error);
      }

      cache.push({
        [paths]: foundFiles,
        filter: filter.join(",")
      });
      resolve(foundFiles);
    });
  }
}

module.exports = Files;
