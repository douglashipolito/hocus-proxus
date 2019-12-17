function FindProxyForURL(url, host) {
  var domain="localhost";
  var ip="127.0.0.1";

  // If the dns matches, send direct.
  if (dnsDomainIs(host, domain))
      return "PROXY " + ip;

  // DEFAULT RULE:
  return "DIRECT";
}
