const globby = require('globby');
const path = require('path');

class Files {
  constructor() {
    return new Promise(async (resolve, reject) => {
      let config;
      try {
        config = await require('./config')();
      } catch(error) {
        reject(error);
        throw new Error('Error on loading configs');
      }

      this.config = config;
      resolve(this);
    });
  }

  findFiles(paths, filter = []) {
    return new Promise(async (resolve, reject) => {
      let foundFiles;
      paths = paths.map(currentPath => path.join(this.config.storefrontPath, currentPath));

      try {
        foundFiles = await globby(paths, { 
          expandDirectories: {
            extensions: filter
          } 
        });
      } catch(error) {
        reject(error);
        throw new Error(error);
      }

      resolve(foundFiles);
    });
  }
}

module.exports = Files;