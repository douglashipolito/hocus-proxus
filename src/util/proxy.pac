function FindProxyForURL(url, host) {
  // If the dns matches, send direct.
  if (dnsDomainIs(host, "#DOMAIN"))
      return "PROXY #PROXY";

  // DEFAULT RULE:
  return "DIRECT";
}
