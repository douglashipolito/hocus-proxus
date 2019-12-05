const path = require("path");
const fs = require("fs-extra");
const Files = require("../helpers/Files");

async function replaceTemplate(bodyResponse, templateFiles, filesHelper) {
  const regions = bodyResponse.regions;
  let foundWidgetsPath = [];
  let widgetsTemplatesContent = {};
  const widgets = [];

  regions.forEach(region => {
    region.widgets.forEach(widget => {
      widgets.push(widget);
    });
  });

  templateFiles.forEach(widgetTemplateFile => {
    const widgetName = path
      .relative(
        path.join(filesHelper.config.storefrontPath, "widgets"),
        widgetTemplateFile
      )
      .split(path.sep)[1];

    widgets.some(widget => {
      if (widget.typeId.includes(widgetName)) {
        foundWidgetsPath.push(widgetTemplateFile);
        return true;
      }
    });
  });

  for await (let foundWidgetPath of foundWidgetsPath) {
    const widgetName = path
      .relative(
        path.join(filesHelper.config.storefrontPath, "widgets"),
        foundWidgetPath
      )
      .split(path.sep)[1];

    if (foundWidgetPath.includes(widgetName)) {
      widgetsTemplatesContent[widgetName] = widgetsTemplatesContent[
        widgetName
      ] || { templates: [], elements: [] };

      if (foundWidgetPath.includes("element")) {
        widgetsTemplatesContent[widgetName].elements.push(
          await fs.readFile(foundWidgetPath, "utf8")
        );
      } else if (foundWidgetPath.includes("display.template")) {
        widgetsTemplatesContent[widgetName].templates.push(
          await fs.readFile(foundWidgetPath, "utf8")
        );
      }
    }
  }

  Object.keys(widgetsTemplatesContent).forEach(widgetName => {
    widgets.some(widget => {
      if (widget.typeId.includes(widgetName)) {
        widget.templateSrc = widgetsTemplatesContent[
          widgetName
        ].templates.join();
        widget.elementsSrc = widgetsTemplatesContent[
          widgetName
        ].elements.join();

        return true;
      }
    });
  });

  return bodyResponse;
}

exports.beforeSendResponse = {
  async shouldResolve({ requestDetail }) {
    return /ccstoreui\/v.+?\/pages\/layout\/.+\??ccvp=.*?$/.test(
      requestDetail.url
    );
  },
  async resolve({ responseDetail }) {
    let filesHelper, templateFiles;

    try {
      filesHelper = await new Files();
      templateFiles = await filesHelper.findFiles(
        ["widgets"],
        ["template", "txt"],
        filesHelper.config.storefrontPath
      );
    } catch (error) {
      console.log(error);
      Promise.reject(error);
      throw new Error(error);
    }

    let newResponse = null;
    let bodyResponse;

    try {
      bodyResponse = JSON.parse(responseDetail.response.body.toString());
      bodyResponse = await replaceTemplate(
        bodyResponse,
        templateFiles,
        filesHelper
      );

      newResponse = { response: { body: JSON.stringify(bodyResponse) } };
    } catch (error) {
      console.log(error);
    }

    return newResponse;
  }
};
