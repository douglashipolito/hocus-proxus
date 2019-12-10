process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const co = require("co");
const path = require("path");
const AnyProxy = require("anyproxy");
const fs = require("fs");
const rootCACheck = require("./util/rootCACheck");
const networkSettings = require("./util/networkSettings");
const exitHook = require("async-exit-hook");
const config = require("./config.json");
const proxyOptions = {
  proxyServer: {},
  isProxyEnabled: true,
  config
};

const rule = require("./rule")(proxyOptions);

co(function*() {
  const internalIp = networkSettings.getIpAddress();
  const proxyPacFile = `http://${internalIp}:${config.webinterfacePort}/proxy.pac`;

  function stopServer(proxyServer) {
    exitHook(callback => {
      console.log("disabling proxy auto config");
      networkSettings.setAutomaticProxy(false, proxyPacFile).then(() => {
        console.log("pausing server...");
        proxyServer.close();
        setTimeout(callback, 200);
      });
    });
  }

  function startServer() {
    const options = {
      port: config.proxyPort,
      rule,
      webInterface: {
        enable: true,
        webPort: config.webinterfacePort
      },
      forceProxyHttps: true
    };

    proxyOptions.proxyServer = new AnyProxy.ProxyServer(options);

    proxyOptions.proxyServer.on("ready", () => {
      /* */
    });
    proxyOptions.proxyServer.on("error", e => {
      /* */
    });
    proxyOptions.proxyServer.start();
    networkSettings.setAutomaticProxy(true, proxyPacFile).then(() => {
      console.log(
        `===> Web Interface address: http://${internalIp}:${config.webinterfacePort}\n`
      );

      console.log(
        `===> Proxy Options:
        - Status: http://${internalIp}:${config.webinterfacePort}/proxy-enabled
        - Enable: http://${internalIp}:${config.webinterfacePort}/proxy-enabled/true
        - Disable: http://${internalIp}:${config.webinterfacePort}/proxy-enabled/false\n`
      );

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
                `${internalIp}:${config.proxyPort}`
              );
              data = data.replace(/#DOMAIN/g, config.domain);
              res.end(data);
            }
          );
        }
      );

      proxyOptions.proxyServer.webServerInstance.app.get(
        "/proxy-enabled/:enabled?",
        (req, res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-type", "application/json");
          const enabledParam = req.params.enabled;

          if (enabledParam) {
            const isProxyEnabled = enabledParam.toLowerCase() === "true";

            if (isProxyEnabled !== proxyOptions.isProxyEnabled) {
              networkSettings.setAutomaticProxy(isProxyEnabled, proxyPacFile);
            }

            proxyOptions.isProxyEnabled = isProxyEnabled;
          }

          res.json({
            enabled: proxyOptions.isProxyEnabled
          });
        }
      );
    });
  }

  const caStatus = yield AnyProxy.utils.certMgr.getCAStatus();

  rule
    .preprocessors()
    .then(() => {
      co(function*() {
        if (caStatus.exist && caStatus.trusted) {
          startServer();
        } else {
          try {
            yield rootCACheck();
            startServer();
          } catch (e) {
            console.error(e);
          }
        }

        stopServer(proxyOptions.proxyServer);
      });
    })
    .catch(error => {
      console.log(error);
      process.exit(0);
    });
});

process
  .on("unhandledRejection", (reason, p) => {
    console.error(reason, "Unhandled Rejection at Promise", p);
  })
  .on("uncaughtException", err => {
    console.error(err, "Uncaught Exception thrown");
    process.exit(1);
  });

process.stdin.resume();
