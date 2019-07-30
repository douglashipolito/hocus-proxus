const jsesc = require('jsesc');

exports.beforeSendResponse = {
  global: true,
  async resolve({ responseDetail }) {
    const newResponse = Object.assign({}, responseDetail.response);    
    const setCookiesHeader = newResponse.header['Set-Cookie'];

    // Encodes any unicode character
    // This comes from Incapsula
    if(setCookiesHeader && Array.isArray(setCookiesHeader)) {
      newResponse.header['Set-Cookie'] = setCookiesHeader.map(cookie => jsesc(cookie));
    }

    return {
      response: newResponse
    }
  }
};