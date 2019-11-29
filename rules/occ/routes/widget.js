const path = require("path");
const fs = require("fs-extra");
const Files = require("../helpers/Files");

const replaceJS = async requestDetail => {
  let files, jsFiles, appLevelFiles;
  let widgetName = requestDetail.url.match(/v.+\/(.+)\/js/) || "";
  if (widgetName) {
    widgetName = widgetName[1];
  }

  try {
    files = await new Files();
    jsFiles = await files.findFiles(
      ["widgets"],
      ["js"],
      files.config.transpiledFolder
    );
  } catch (error) {
    console.log(error);
    Promise.reject(error);
    throw new Error(error);
  }

  const widgetsFiles = jsFiles.filter(jsFile =>
    new RegExp(widgetName).test(jsFile)
  );

  if (widgetsFiles.length) {
    const fileName = path
      .basename(requestDetail.url)
      .replace(/\.min/, "")
      .replace(/\?bust.*/, "");
    const filePath = widgetsFiles.find(
      widgetFile => path.basename(widgetFile) === fileName
    );

    let fileContent = "";

    if (filePath) {
      try {
        fileContent = await fs.readFile(filePath);
      } catch (error) {
        console.log("Error on loading ", filePath);
        Promise.reject(error);
      }
    }

    return {
      response: {
        statusCode: 200,
        header: requestDetail.requestOptions.headers,
        body: fileContent
      }
    };
  }
};

exports.beforeSendRequest = {
  async shouldResolve({ requestDetail }) {
    return /\/widget/.test(requestDetail.url);
  },
  async resolve({ requestDetail }) {
    if (/\.js/.test(requestDetail.url)) {
      return replaceJS(requestDetail);
    }
  }
};
