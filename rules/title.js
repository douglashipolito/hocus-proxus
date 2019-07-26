module.exports = {
  beforeSendRequest: {
    check: (requestDetail) => {
      return false;
    },
    resolve: (requestDetail) => {
    }  
  }
};