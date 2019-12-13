
exports.beforeSendRequest = {
  async shouldResolve({ requestDetail }) {
    return /fake\.js/.test(requestDetail.url);
  },
  async resolve({ requestDetail }) {
    requestDetail.requestOptions.headers['Content-Type'] = "application/javacript";

    return {
      response: {
        statusCode: 200,
        header: requestDetail.requestOptions.headers,
        body: 'console.log("Fake!");'
      }
    };
  }
};
