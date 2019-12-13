process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const os = require('os');
const co = require("co");
const path = require('path');
const AnyProxy = require("anyproxy");
const _ = require('lodash');
const ruleDefinition = require("./rule");
const webInterfaceRoutes = require("./web-interface-routes");
const rootCACheck = require("./util/root-ca-check");
const networkSettings = require("./util/network-settings");
const exitHook = require("async-exit-hook");

class Proxy {
  constructor(hocusProxusOptions = {}) {
    const internalIp = this.getInternalIp();
    const hocusProxusUserPath = path.join(os.homedir(), 'hocus-proxus');
    const rulesPath = path.join(hocusProxusUserPath, 'rules');

    const proxyConfig = {
      proxyPort: 8001,
      webinterfacePort: 8002,
      domain: "example.com"
    }

    const defaultOptions = {
      proxyServer: {},
      rulesPath,
      rulesConfigFile: path.join(rulesPath,'config.json'),
      exampleRulePath: path.join(rulesPath, 'example-rule'),
      internalIp,
      proxyPacFile: `http://${internalIp}:${proxyConfig.webinterfacePort}/proxy.pac`,
      isProxyEnabled: true,
      config: proxyConfig
    };

    this.hocusProxusOptions = _.defaultsDeep(defaultOptions, hocusProxusOptions);

    process
      .on("unhandledRejection", (reason, p) => {
        console.error(reason, "Unhandled Rejection at Promise", p);
      })
      .on("uncaughtException", err => {
        console.error(err, "Uncaught Exception thrown");
        process.exit(1);
      });
  }

  start() {
    return new Promise(async (resolve, reject) => {
      try {
        this.rule = await this.setRules(this.hocusProxusOptions);
        const caStatus = await this.getCAStatus();

        if (!caStatus.exist && !caStatus.trusted) {
          await this.rootCACheck();
        }

        await this.enableSystemProxy({
          proxyPac: this.hocusProxusOptions.proxyPacFile
        });
        console.log(
          `===> Proxy Options:
          - Status: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.config.webinterfacePort}/proxy-enabled
          - Enable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.config.webinterfacePort}/proxy-enabled/true
          - Disable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.config.webinterfacePort}/proxy-enabled/false\n`
        );

        await this.startProxyServer();

        // Setting custom routes for the Web Interface
        await this.setWebInterfaceRoutes(this.hocusProxusOptions);

        // Run Preprocessors
        await this.rule.preprocessors();

        //On Exit
        exitHook(async callback => {
          console.log("disabling proxy auto config");
          try {
            await this.disableSystemProxy({
              proxyPac: this.hocusProxusOptions.proxyPacFile
            });
            console.log("pausing server...");
            this.hocusProxusOptions.proxyServer.close();
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

  startProxyServer() {
    return new Promise((resolve, reject) => {
      this.serverOptions = {
        port: this.hocusProxusOptions.config.proxyPort,
        rule: this.rule,
        webInterface: {
          enable: true,
          webPort: this.hocusProxusOptions.config.webinterfacePort
        },
        forceProxyHttps: true
      };

      this.hocusProxusOptions.proxyServer = new AnyProxy.ProxyServer(
        this.serverOptions
      );
      this.hocusProxusOptions.proxyServer.on("ready", resolve);
      this.hocusProxusOptions.proxyServer.on("error", reject);
      this.hocusProxusOptions.proxyServer.start();
    });
  }

  async rootCACheck() {
    return await rootCACheck();
  }

  getCAStatus() {
    return co.wrap(function*(val) {
      return yield AnyProxy.utils.certMgr.getCAStatus();
    });
  }

  async enableSystemProxy({ proxyPac }) {
    return await networkSettings.toggleSystemProxy({
      enable: true,
      proxyPac,
      ip: this.hocusProxusOptions.internalIp,
      port: this.hocusProxusOptions.config.proxyPort
    });
  }

  async disableSystemProxy({ proxyPac }) {
    return await networkSettings.toggleSystemProxy({
      enable: false,
      proxyPac,
      ip: this.hocusProxusOptions.internalIp,
      port: this.hocusProxusOptions.config.proxyPort
    });
  }

  async setWebInterfaceRoutes(hocusProxusOptions) {
    // Setting custom routes for the Web Interface
    return await webInterfaceRoutes(hocusProxusOptions);
  }

  setRules(hocusProxusOptions) {
    return ruleDefinition(hocusProxusOptions);
  }

  getInternalIp() {
    return networkSettings.getIpAddress();
  }
}

module.exports = Proxy;
