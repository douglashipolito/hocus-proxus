const transpiler = require('../transpiler');

exports.beforeSendResponse = {
  async shouldResolve({ responseDetail }) {
    return new Promise(async (resolve, reject) => {
      
      resolve(false);
    });
  },
  async resolve({ responseDetail }) {
    
  }
};