const fs = require("fs-extra");
const path = require("path");
const networkSettings = require("./util/network-settings");

module.exports = async hocusProxusInstance => {
  const hocusProxusOptions = hocusProxusInstance.hocusProxusOptions;

  // Proxy Pac
  hocusProxusInstance.proxyServer.webServerInstance.app.get(
    "/proxy.pac",
    async (req, res) => {
      let proxyPacContent = '';
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-type", "text/plain");

      try {
        proxyPacContent =  await fs.readFile(hocusProxusOptions.proxyPacFilePath, { encoding: "utf8" });
      } catch(error) {
        const errorMessage = `Error on loading ${hocusProxusOptions.proxyPacFilePath}`;
        console.log(errorMessage, error);
        return res.end({ error: true, message: errorMessage });
      }

      res.end(proxyPacContent);
    }
  );

  // Proxy control
  hocusProxusInstance.proxyServer.webServerInstance.app.get(
    "/proxy-enabled/:enabled?",
    (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-type", "application/json");
      const enabledParam = req.params.enabled;

      if (enabledParam) {
        const isProxyEnabled = enabledParam.toLowerCase() === "true";

        if (isProxyEnabled !== hocusProxusInstance.isProxyEnabled) {
          networkSettings.setAutomaticProxy(
            isProxyEnabled,
            hocusProxusOptions.proxyPacFile
          );
        }

        hocusProxusInstance.isProxyEnabled = isProxyEnabled;
      }

      res.json({
        enabled: hocusProxusInstance.isProxyEnabled
      });
    }
  );
};
