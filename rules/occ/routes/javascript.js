const path = require("path");
const fs = require("fs-extra");
const Files = require("../helpers/Files");

const replace = async requestDetail => {
  let files, foundJsFiles, requestedFileName;
  
  try {
    files = await new Files();
    requestedFileName = files.fileName(requestDetail.url);
    foundJsFiles = await files.findFiles(
      ["widgets", 'app-level'],
      ["js"],
      files.config.transpiledFolder
    );
  } catch (error) {
    console.log(error);
    Promise.reject(error);
    throw new Error(error);
  }

  const jsFiles = foundJsFiles.filter(jsFile =>
    new RegExp(requestedFileName).test(jsFile)
  );

  if (jsFiles.length) {
    const fileName = path
      .basename(requestDetail.url)
      .replace(/\.min/, "")
      .replace(/\?bust.*/, "");
    const filePath = jsFiles.find(
      file => path.basename(file) === fileName
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

    return null;
  }
};

exports.beforeSendRequest = {
  async shouldResolve({ requestDetail }) {
    return /\/widget|global/.test(requestDetail.url);
  },
  async resolve({ requestDetail }) {
    if (/\.js/.test(requestDetail.url)) {
      return replace(requestDetail);
    }
  }
};
