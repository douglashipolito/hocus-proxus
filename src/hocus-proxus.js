process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const os = require("os");
const co = require("co");
const path = require("path");
const fs = require('fs-extra');
const { Signale } = require("signale");
const AnyProxy = require("anyproxy");
const _ = require("lodash");
const Rule = require("./rule");
const ruleDefinition = require("./rule-definition");
const webInterfaceRoutes = require("./web-interface-routes");
const RootCACheck = require("./util/root-ca-check");
const NetworkSettings = require("./util/network-settings");
const exitHook = require("async-exit-hook");
const qrcode = require("qrcode-terminal");
const launcher = require("@httptoolkit/browser-launcher");
const isWsl = require('is-wsl');
const shelljs = require('shelljs');
const wslBrowserConfigsFilePath = path.join(process.env.HOME || process.env.HOMEPATH, '.config', 'browser-launcher', 'config.json');

class HocusProxus {
  constructor(hocusProxusOptions = {}) {
    const logScope = "hoxus-proxus";
    this.logger = new Signale({
      scope: logScope
    });

    this.logger.interactive = () => {
      return new Signale({
        scope: logScope,
        interactive: true
      });
    };

    this.Signale = Signale;

    this.networkSettings = new NetworkSettings(this);
    this.rootCACheck = new RootCACheck(this);

    const internalIp = this.getInternalIp();
    const hocusProxusUserPath =
      hocusProxusOptions.hocusProxusUserPath ||
      path.join(os.homedir(), "hocus-proxus");
    const rulesPath =
      hocusProxusOptions.rulesPath || path.join(hocusProxusUserPath, "rules");
    const webInterfacePort = 8002;
    const proxyPacRoute = `http://${internalIp}:${webInterfacePort}/proxy.pac`;

    this.isServerRunning = true;
    this.isProxyEnabled = true;
    this.proxyServer = {};

    this.hocusProxusOptions = _.defaultsDeep(hocusProxusOptions, {
      debug: false,
      hocusProxusUserPath,
      proxyPort: 8001,
      webInterfacePort,
      domain: "example.com",
      useBrowser: true,
      browserConfigs: {
        browser: "chrome",
        options: [
          `--proxy-pac-url=${proxyPacRoute}`,
          "--auto-open-devtools-for-tabs",
          "--ignore-certificate-errors",
          "--allow-insecure-localhost",
          "--disable-blink-features=BlockCredentialedSubresources",
          "--test-type"
        ]
      },
      rulesPath,
      rulesConfigFile: path.join(hocusProxusUserPath, "rules-config.json"),
      exampleRulePath: path.join(rulesPath, "example-rule"),
      enabledRule: null,
      internalIp,
      proxyPacFile: proxyPacRoute,
      proxyPacFilePath: path.join(hocusProxusUserPath, "proxy.pac")
    });

    this.rule = new Rule(this.hocusProxusOptions, this);

    process
      .on("unhandledRejection", (reason, p) => {
        this.logger.error(reason, "Unhandled Rejection at Promise", p);
      })
      .on("uncaughtException", err => {
        this.logger.error(err, "Uncaught Exception thrown");
        process.exit(1);
      });
  }

  start() {
    return new Promise(async (resolve, reject) => {
      try {
        this.ruleDefinition = await this.setRules(this.hocusProxusOptions);
        const caStatus = await this.getCAStatus();

        if (!caStatus.exist && !caStatus.trusted) {
          await this.rootCACheck.check();
        }

        await this.startProxyServer();

        // Setting custom routes for the Web Interface
        await this.setWebInterfaceRoutes();

        // Run Preprocessors
        await this.ruleDefinition.preprocessors();

        this.logger.info(
          `Proxying the domain "${this.hocusProxusOptions.domain}`
        );
        this.logger.info(
          `Proxy Options:
          - Proxy Server: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.proxyPort}
          - Proxy PAC File: ${this.hocusProxusOptions.proxyPacFile}
          - Status: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/proxy-enabled
          - Enable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/proxy-enabled/true
          - Disable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/proxy-enabled/false`
        );

        if (!this.hocusProxusOptions.useBrowser) {
          await this.enableSystemProxy();
        } else {
          await this.setProxyPacFile({
            proxyPac: {
              url: this.hocusProxusOptions.proxyPacFile,
              path: this.hocusProxusOptions.proxyPacFilePath
            },
            domain: this.hocusProxusOptions.domain,
            ip: this.hocusProxusOptions.internalIp,
            port: this.hocusProxusOptions.proxyPort
          });
          await this.openBrowser(
            this.hocusProxusOptions.domain,
            this.hocusProxusOptions.browserConfigs
          );
        }

        try {
          const downloadCertQRCode = await this.printQRCode(
            `http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/downloadCrt`
          );
          this.logger.info(
            `QR CODE - Use the following QR Code in your cell phone to download the certificate and trust it:`
          );
          console.log(downloadCertQRCode);
        } catch (error) {
          this.logger.error(
            "An Error has been found while Hocus Proxus was trying to generate the QR CODE. However your proxy will start normally."
          );
          this.logger.error("This is the error.", error);
        }

        //On Exit
        exitHook(async callback => {
          this.logger.info("disabling proxy auto config");
          try {
            if (!this.hocusProxusOptions.useBrowser) {
              await this.disableSystemProxy();
            }

            this.logger.info("pausing server...");
            this.proxyServer.close();
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
        port: this.hocusProxusOptions.proxyPort,
        rule: this.ruleDefinition,
        webInterface: {
          enable: true,
          webPort: this.hocusProxusOptions.webInterfacePort
        },
        forceProxyHttps: false,
        silent: !this.hocusProxusOptions.debug
      };

      this.proxyServer = new AnyProxy.ProxyServer(this.serverOptions);
      this.proxyServer.on("ready", resolve);
      this.proxyServer.on("error", reject);
      this.proxyServer.start();
      this.isServerRunning = true;
    });
  }

  getCAStatus() {
    return co.wrap(function*(val) {
      return yield AnyProxy.utils.certMgr.getCAStatus();
    })();
  }

  setProxyPacFile({ proxyPac, domain, ip, port }) {
    return this.networkSettings.setProxyPacFile({
      proxyPac,
      domain,
      ip,
      port
    });
  }

  async toggleSystemProxy(enable, { proxyPac, domain, ip, port } = {}) {
    proxyPac =
      typeof proxyPac !== "undefined"
        ? proxyPac
        : {
            url: this.hocusProxusOptions.proxyPacFile,
            path: this.hocusProxusOptions.proxyPacFilePath
          };
    domain = domain ? domain : this.hocusProxusOptions.domain;
    ip = ip ? ip : this.hocusProxusOptions.internalIp;
    port = port ? port : this.hocusProxusOptions.proxyPort;

    try {
      await this.setProxyPacFile({
        proxyPac,
        domain,
        ip,
        port
      });
    } catch (error) {
      return Promise.reject(error);
    }

    return this.networkSettings.toggleSystemProxy({
      enable,
      proxyPac,
      domain,
      ip,
      port
    });
  }

  async enableSystemProxy(options) {
    return this.toggleSystemProxy(true, options);
  }

  async disableSystemProxy(options) {
    return this.toggleSystemProxy(false, options);
  }

  async setWebInterfaceRoutes() {
    // Setting custom routes for the Web Interface
    return await webInterfaceRoutes(this);
  }

  async setRules(hocusProxusOptions) {
    try {
      await this.rule.setRules();
    } catch (error) {
      this.logger.error("Error on setting the rules", error);
      process.exit(0);
    }

    return ruleDefinition(hocusProxusOptions, this.rule);
  }

  listRules() {
    return this.rule.listRules();
  }

  updateRuleConfig(config = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const previousRulesConfig = await this.rule.getRulesConfig();
        const newConfig = await this.rule.updateRuleConfig(config);
        if (previousRulesConfig.domain !== newConfig.domain) {
          this.hocusProxusOptions.domain = newConfig.domain;

          await this.networkSettings.setProxyPacFile({
            proxyPac: {
              url: this.hocusProxusOptions.proxyPacFile,
              path: this.hocusProxusOptions.proxyPacFilePath
            },
            domain: this.hocusProxusOptions.domain,
            ip: this.hocusProxusOptions.internalIp,
            port: this.hocusProxusOptions.proxyPort
          });
        }
        resolve(newConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  getInternalIp() {
    return this.networkSettings.getIpAddress();
  }

  listConfigs() {
    return this.rule.getRulesConfig();
  }

  printQRCode(data) {
    return new Promise((resolve, reject) => {
      if (!data) {
        return reject("Please provide a string for the QR Code");
      }

      try {
        qrcode.generate(data, { small: true }, resolve);
      } catch (error) {
        reject(error);
      }
    });
  }

  configureWSLBrowsers() {
    return new Promise(async (resolve, reject) => {
      try {
        fs.accessSync(wslBrowserConfigsFilePath, fs.F_OK);
      } catch (e) {
        await fs.outputJson(wslBrowserConfigsFilePath, { browsers: [] }, { spaces: 2 });
      }

      let browsersConfigs;
      try {
        browsersConfigs = await fs.readJson(wslBrowserConfigsFilePath);
      } catch (error) {
        return reject(error);
      }

      if(browsersConfigs.wslSet) {
        return resolve();
      }

      const wslWindowsUserPath = shelljs.exec('wslpath $(cmd.exe /c "echo %USERPROFILE%")', { silent: true }).stdout.trim();
      const hostWindowsPath = shelljs.exec('cmd.exe /c "echo %HOMEDRIVE%%HOMEPATH%"', { silent: true }).stdout.trim();

      try {
        await fs.copy(path.join(__dirname, 'util', 'installed-browsers.bat'), path.join(wslWindowsUserPath, 'installed-browsers.bat'));
      } catch(error) {
        return reject(error);
      }

      const browsersAbsolutPaths = shelljs.exec(`cmd.exe /c "${hostWindowsPath}\\installed-browsers.bat"`, { silent: true }).stdout.trim().replace(/\r/g, '').split(/\n/);
      const defaultConfigsHostPath = `${hostWindowsPath}\\.config\\browser-launcher`; // dont use path.sep here since we are forcing it to be windows like

      const defaultConfigObject = {
        "regex": {},
        "profile": defaultConfigsHostPath,
        "type": "",
        "name": "",
        "command": "",
        "version": "custom"
      }

      if(browsersAbsolutPaths.length) {
        let hasChrome = false;

        browsersConfigs.browsers = [];

        browsersAbsolutPaths.forEach(browserPath => {
          const browserName = browserPath.split('\\').reverse()[0].replace('.exe', '');
          this.logger.info("Browser found: ", browserPath);

          const browserConfig = JSON.parse(JSON.stringify(defaultConfigObject));
          browserConfig.profile = browserConfig.profile + '\\' + browserName;
          browserConfig.type = browserName;
          browserConfig.name = browserName;
          browserConfig.command = browserPath.replace('C:\\', '/mnt/c/').replace(/\\/g, '/');
          browsersConfigs.browsers.push(browserConfig);

          if(browserConfig.name === 'chrome') {
            hasChrome = true;
          }
        });

        browsersConfigs.defaultBrowser = hasChrome ? 'chrome' : browsersConfigs.browsers[0].name;
        browsersConfigs.wslSet = true;

        try {
          await fs.writeJson(wslBrowserConfigsFilePath, browsersConfigs, { spaces: 2 });
          resolve();
        } catch(error) {
          return reject(error);
        }
      } else {
        this.logger.error("No Browsers have been found. Exiting...");
        return reject();
      }
    });
  }

  openBrowser(url, options) {
    if (!/http/.test(url)) {
      url = "https://example.com";
    }

    return new Promise(async (resolve, reject) => {
      const startBrowser = () =>
        new Promise(async (resolve, reject) => {
          if(isWsl) {
            try {
              await this.configureWSLBrowsers();
            } catch(error) {
              return reject(error);
            }
          }

          launcher((error, launch) => {
            if (error) {
              return reject(error);
            }

            resolve(launch);
          });
        });

      const launchBrowser = launch => {
        return new Promise((resolve, reject) => {
          launch(url, options, error => {
            if (error) {
              return reject(error);
            }
            this.logger.info(`The browser ${options.browser} has been started`);
            resolve();
          });
        });
      };

      try {
        const launch = await startBrowser();
        let browserConfig = launch.browsers.find(browser =>
          /browser-launcher/.test(browser.profile)
        );

        if (browserConfig) {
          const configFilePath = isWsl ? wslBrowserConfigsFilePath : path.resolve(
            browserConfig.profile,
            "..",
            "config.json"
          );

          const browserConfig = await fs.readJson(configFilePath);
          if(browserConfig.defaultBrowser) {
            options.browser = browserConfig.defaultBrowser;
          }

          this.logger.info(
            `You can add new browsers at the config file available at ${configFilePath}`
          );
        }

        await launchBrowser(launch);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = HocusProxus;
