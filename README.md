# pollen

DNS polling for HTTP Keep-Alive of Node.js HTTP clients

## Why?

- Support server-side traffic switch using [weighted DNS routing](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html#routing-policy-weighted)
- Eliminate latency of making new connections (DNS query, TCP & TLS handshakes)
- Stay resilient to DNS query failures

To achieve good performance, we want to keep Keep-Alive connections as much as possible. On the over hand, DNS-based traffic switch doesn't allow us to keep connections forever because existing persistent connections can become stale when DNS records change.

This package polls DNS records and keep Keep-Alive connections using [agentkeepalive](https://github.com/node-modules/agentkeepalive) as long as DNS records stay same. When DNS records change, it creates new connections with already retrieved IP addresses without making new DNS queries.

Even when DNS records change, existing connections are not immediately terminated. We can keep them for the next DNS record change (for example, DNS records can go back and forth with weighted DNS routing) with `freeSocketTimeout` option of `agentkeepalive`.

## Example

```js
const https = require('https');
const { PollingManager, HttpsAgent } = require('@shuhei/pollen');

const dnsPolling = new PollingManager({
  interval: 30 * 1000 // 30 seconds by default
});
// Just a thin wrapper of https://github.com/node-modules/agentkeepalive
// It accepts all the options of `agentkeepalive`.
const agent = new HttpsAgent();

const hostname = 'shuheikagawa.com';
const req = https.request({
  hostname,
  path: '/',
  // Make sure to call `getLookup()` for each request!
  lookup: dnsPolling.getLookup(hostname),
  agent,
});
```
