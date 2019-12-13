exports.beforeSendResponse = {
  async shouldResolve({ responseDetail }) {
    return /text\/html/.test(responseDetail.response.header["Content-Type"]);
  },
  async resolve() {
    const newResponse = {};
    newResponse.body = "<html><head><title>Hocus Proxus!</title></head><body><h1>Hocus Proxus is Working!</h1></body></html>";

    return {
      response: newResponse
    };
  }
};
