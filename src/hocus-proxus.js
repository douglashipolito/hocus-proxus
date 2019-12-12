process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const co = require("co");
const AnyProxy = require("anyproxy");
const ruleDefinition = require("./rule");
const webInterfaceRoutes = require("./web-interface-routes");
const rootCACheck = require("./util/root-ca-check");
const networkSettings = require("./util/network-settings");
const exitHook = require("async-exit-hook");
const config = require("./config.json");

class Proxy {
  constructor() {
    const internalIp = this.getInternalIp();
    this.proxyOptions = {
      proxyServer: {},
      internalIp,
      proxyPacFile: `http://${internalIp}:${config.webinterfacePort}/proxy.pac`,
      isProxyEnabled: true,
      config
    };

    this.rule = this.setRules();

    this.serverOptions = {
      port: config.proxyPort,
      rule: this.rule,
      webInterface: {
        enable: true,
        webPort: config.webinterfacePort
      },
      forceProxyHttps: true
    };

    process
      .on("unhandledRejection", (reason, p) => {
        console.error(reason, "Unhandled Rejection at Promise", p);
      })
      .on("uncaughtException", err => {
        console.error(err, "Uncaught Exception thrown");
        process.exit(1);
      });
  }

  async start() {
    return new Promise(async (resolve, reject) => {
      try {
        const caStatus = await this.getCAStatus();

        if (!caStatus.exist && !caStatus.trusted) {
          await this.rootCACheck();
        }

        await this.enableSystemProxy({
          proxyPac: this.proxyOptions.proxyPacFile
        });
        console.log(
          `===> Proxy Options:
          - Status: http://${this.proxyOptions.internalIp}:${config.webinterfacePort}/proxy-enabled
          - Enable: http://${this.proxyOptions.internalIp}:${config.webinterfacePort}/proxy-enabled/true
          - Disable: http://${this.proxyOptions.internalIp}:${config.webinterfacePort}/proxy-enabled/false\n`
        );

        await this.startProxyServer();

        // Setting custom routes for the Web Interface
        await this.setWebInterfaceRoutes(this.proxyOptions);

        // Run Preprocessors
        await this.rule.preprocessors();

        //On Exit
        exitHook(async callback => {
          console.log("disabling proxy auto config");
          try {
            await this.disableSystemProxy({
              proxyPac: this.proxyOptions.proxyPacFile
            });
            console.log("pausing server...");
            this.proxyOptions.proxyServer.close();
            await new Promise(resolve => setTimeout(resolve, 200));
            callback();
          } catch (error) {
            callback();
          }
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async startProxyServer() {
    return new Promise((resolve, reject) => {
      this.proxyOptions.proxyServer = new AnyProxy.ProxyServer(
        this.serverOptions
      );
      this.proxyOptions.proxyServer.on("ready", resolve);
      this.proxyOptions.proxyServer.on("error", reject);
      this.proxyOptions.proxyServer.start();
    });
  }

  async rootCACheck() {
    return await rootCACheck();
  }

  async getCAStatus() {
    return co.wrap(function*(val) {
      return yield AnyProxy.utils.certMgr.getCAStatus();
    });
  }

  async enableSystemProxy({ proxyPac }) {
    return await networkSettings.toggleSystemProxy({
      enable: true,
      proxyPac,
      ip: this.proxyOptions.internalIp,
      port: config.proxyPort
    });
  }

  async disableSystemProxy({ proxyPac }) {
    return await networkSettings.toggleSystemProxy({
      enable: false,
      proxyPac,
      ip: this.proxyOptions.internalIp,
      port: config.proxyPort
    });
  }

  async setWebInterfaceRoutes(proxyOptions) {
    // Setting custom routes for the Web Interface
    return await webInterfaceRoutes(proxyOptions);
  }

  setRules() {
    return ruleDefinition(this.proxyOptions);
  }

  getInternalIp() {
    return networkSettings.getIpAddress();
  }
}

module.exports = Proxy;
