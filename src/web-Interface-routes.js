const fs = require("fs-extra");
const path = require("path");
const networkSettings = require("./util/network-settings");

module.exports = async proxyOptions => {
  // Proxy Pac
  proxyOptions.proxyServer.webServerInstance.app.get(
    "/proxy.pac",
    async (req, res) => {
      let proxyPacContent = '';
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-type", "text/plain");

      try {
        proxyPacContent =  await fs.readFile(proxyOptions.proxyPacFilePath, { encoding: "utf8" });
      } catch(error) {
        const errorMessage = `Error on loading ${proxyOptions.proxyPacFilePath}`;
        console.log(errorMessage, error);
        return res.end({ error: true, message: errorMessage });
      }

      res.end(proxyPacContent);
    }
  );

  // Proxy control
  proxyOptions.proxyServer.webServerInstance.app.get(
    "/proxy-enabled/:enabled?",
    (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-type", "application/json");
      const enabledParam = req.params.enabled;

      if (enabledParam) {
        const isProxyEnabled = enabledParam.toLowerCase() === "true";

        if (isProxyEnabled !== proxyOptions.isProxyEnabled) {
          networkSettings.setAutomaticProxy(
            isProxyEnabled,
            proxyOptions.proxyPacFile
          );
        }

        proxyOptions.isProxyEnabled = isProxyEnabled;
      }

      res.json({
        enabled: proxyOptions.isProxyEnabled
      });
    }
  );
};
