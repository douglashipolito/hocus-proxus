const Files = require('./Files');

class Transpiler {
  constructor() {
    return new Promise(async (resolve, reject) => {  
      
      try {
        this.config = await require('./config')();
        resolve(this);
      } catch(error) {
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
        jsFiles = await files.findFiles(['widgets', 'app-level'], ['js']);
      } catch(error) {
        console.log(error)
        reject(error);
        throw new Error(error);
      }
  
      console.log(jsFiles);
    });
  }
}

(async () => {
  const transpiler = await new Transpiler();
  await transpiler.js();
})();

process.stdin.resume();

module.exports = Transpiler;