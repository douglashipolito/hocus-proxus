const fs = require("fs-extra");
const path = require("path");
const networkSettings = require("./util/networkSettings");

module.exports = async proxyOptions => {
  // Proxy Pac
  proxyOptions.proxyServer.webServerInstance.app.get(
    "/proxy.pac",
    (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-type", "text/plain");
      fs.readFile(
        path.join(__dirname, "util", "proxy.pac"),
        { encoding: "utf8" },
        (error, data) => {
          if (error) {
            console.log(error);
            return res.end("Error on requesting proxy pac");
          }

          data = data.replace(
            /#PROXY/g,
            `${proxyOptions.internalIp}:${proxyOptions.config.proxyPort}`
          );
          data = data.replace(/#DOMAIN/g, proxyOptions.config.domain);
          res.end(data);
        }
      );
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
