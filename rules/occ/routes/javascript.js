const path = require("path");
const fs = require("fs-extra");
const Files = require("../helpers/Files");

exports.beforeSendRequest = {
  async shouldResolve({ requestDetail }) {
    return /\.js|\/js\//.test(requestDetail.url);
  },
  async resolve({ requestDetail }) {
    let files, jsFiles, requestedFileName;

    if (!/\.js/.test(requestDetail.url)) {
      requestDetail.url = requestDetail.url.replace(/\?bust/, ".js?bust");
    }

    try {
      files = await new Files();
      requestedFileName = files.fileName(requestDetail.url);
      jsFiles = await files.findFiles(
        ["widgets", "app-level"],
        ["js"],
        files.config.transpiledFolder
      );
    } catch (error) {
      console.log(error);
      Promise.reject(error);
      throw new Error(error);
    }

    //If there is no local file, don't change the response
    if (!requestedFileName) {
      return null;
    }

    const foundJsFiles = jsFiles.filter(jsFile =>
      new RegExp(requestedFileName).test(jsFile)
    );
    
    if (foundJsFiles.length) {
      const filePath = foundJsFiles.find(
        file => path.basename(file) === requestedFileName || (path.basename(file).includes('index.js') && file.includes(requestedFileName))
      );

      let fileContent = "";

      if (filePath) {
        try {
          fileContent = await fs.readFile(filePath);
        } catch (error) {
          console.log("Error on loading ", filePath);
          Promise.reject(error);
        }

        return {
          response: {
            statusCode: 200,
            header: requestDetail.requestOptions.headers,
            body: fileContent
          }
        };
      }
    }
    return null;
  }
};
