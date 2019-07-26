const cheerio = require('cheerio');

module.exports = {
  *beforeSendRequest(requestDetail) {
    console.log(requestDetail.url);
  },
  *beforeSendResponse(requestDetail, responseDetail) {
    if(/text\/html/.test(responseDetail.response.header['Content-Type'])) {
    const newResponse = Object.assign({}, responseDetail.response);
    const body = newResponse.body.toString();
    const $ = cheerio.load(body, { decodeEntities: false });
    $('title').text('domsdomsd');
    newResponse.body = $.html();
      return {
        response: newResponse
      };
    }

    return null;
  }
};