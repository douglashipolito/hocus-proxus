exports.beforeSendResponse = {
  async shouldResolve({ responseDetail }) {
    return false;
  },
  async resolve({ responseDetail }) {
    
  }
};