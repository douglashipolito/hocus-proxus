const co = require('co');
const AnyProxy = require('anyproxy');
const fs = require('fs');
const rootCACheck = require('./rootCACheck');
const lan = require('lan-settings');
const exitHook = require('async-exit-hook');
let proxyServer;

function setProxyConfig(enable, done = function() {}) {
  const proxyPacFile = 'http://127.0.0.1:8002/proxy.pac';

  lan.setSettings({
    autoConfig: enable,
    autoConfigUrl: proxyPacFile
  })
  .then(() => {
    if(enable) {
      console.log(`Proxy Auto Config enabled and set to ${proxyPacFile}`);
    } else {
      console.log(`Proxy Auto Config disabled`);
    }
    done()
  })
  .catch(error => {
    console.log('Proxy Lan Settings: ', error);
    done(error);
  });

  if(enable) {
    proxyServer.webServerInstance.app.get('/proxy.pac', (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-type', 'text/plain');
      fs.readFile('proxy.pac', { encoding: 'utf8' }, (error, data) => {
        if(error) {
          console.log(error);
          return res.end('Error on requesting proxy pac');
        }

        res.end(data);
      });
    });
  }
}

function startServer() {
  const options = {
    port: 8001,
    rule: require('./rules'),
    webInterface: {
      enable: true,
      webPort: 8002
    },
    forceProxyHttps: true
  };

  proxyServer = new AnyProxy.ProxyServer(options);

  proxyServer.on('ready', () => { /* */ });
  proxyServer.on('error', (e) => { /* */ });
  proxyServer.start();
  setProxyConfig(true);
}

co(function *() {
  const caStatus = yield AnyProxy.utils.certMgr.getCAStatus();

  if(caStatus.exist && caStatus.trusted) {
    startServer();
  } else {
    try {
      yield rootCACheck();
      startServer();
    } catch (e) {
      console.error(e);
    }
  }

  exitHook(callback => {
    console.log('disabling proxy auto config');
    setProxyConfig(false, () => {
      console.log('pausing server...');
      proxyServer.close();
      setTimeout(callback, 200);
    });
  });
});
