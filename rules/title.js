const cheerio = require('cheerio');

module.exports = {
  type: 'beforeSendResponse',
  check(requestDetail, responseDetail) {
    return /text\/html/.test(responseDetail.response.header['Content-Type'])
  },
  *resolve(requestDetail, responseDetail) {
    const newResponse = {};
    const body = responseDetail.response.body.toString();
    const $ = cheerio.load(body, { decodeEntities: false });
    $('title').text('domsdomsd');
    newResponse.body = $.html();

    return {
      response: newResponse
    };
  }
};