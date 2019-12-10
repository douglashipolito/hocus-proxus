process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const co = require("co");
const AnyProxy = require("anyproxy");
const ruleDefinition = require("./rule");
const webInterfaceRoutes = require("./webInterfaceRoutes");
const rootCACheck = require("./util/rootCACheck");
const networkSettings = require("./util/networkSettings");
const exitHook = require("async-exit-hook");
const config = require("./config.json");

async function main() {
  const internalIp = networkSettings.getIpAddress();
  const proxyOptions = {
    proxyServer: {},
    internalIp,
    proxyPacFile: `http://${internalIp}:${config.webinterfacePort}/proxy.pac`,
    isProxyEnabled: true,
    config
  };

  const rule = ruleDefinition(proxyOptions);

  const getCAStatus = co.wrap(function*(val) {
    return yield AnyProxy.utils.certMgr.getCAStatus();
  });

  const serverOptions = {
    port: config.proxyPort,
    rule,
    webInterface: {
      enable: true,
      webPort: config.webinterfacePort
    },
    forceProxyHttps: true
  };

  const startServer = () => {
    return new Promise((resolve, reject) => {
      proxyOptions.proxyServer = new AnyProxy.ProxyServer(serverOptions);
      proxyOptions.proxyServer.on("ready", resolve);
      proxyOptions.proxyServer.on("error", reject);
      proxyOptions.proxyServer.start();
    });
  };

  try {
    const caStatus = await getCAStatus();

    if (!caStatus.exist && !caStatus.trusted) {
      await rootCACheck();
    }

    await networkSettings.setAutomaticProxy(true, proxyOptions.proxyPacFile);
    console.log(
      `===> Proxy Options:
      - Status: http://${internalIp}:${config.webinterfacePort}/proxy-enabled
      - Enable: http://${internalIp}:${config.webinterfacePort}/proxy-enabled/true
      - Disable: http://${internalIp}:${config.webinterfacePort}/proxy-enabled/false\n`
    );

    await startServer();

    // Setting custom routes for the Web Interface
    webInterfaceRoutes(proxyOptions);

    // Run Preprocessors
    await rule.preprocessors();

    //On Exit
    exitHook(async callback => {
      console.log("disabling proxy auto config");
      try {
        await networkSettings.setAutomaticProxy(
          false,
          proxyOptions.proxyPacFile
        );
        console.log("pausing server...");
        proxyOptions.proxyServer.close();
        await new Promise(resolve => setTimeout(resolve, 200));
        callback();
      } catch (error) {
        callback();
      }
    });
  } catch (error) {
    console.log(error);
    process.exit(0);
  }
}

process
  .on("unhandledRejection", (reason, p) => {
    console.error(reason, "Unhandled Rejection at Promise", p);
  })
  .on("uncaughtException", err => {
    console.error(err, "Uncaught Exception thrown");
    process.exit(1);
  });

main();
