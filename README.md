# pollen

DNS polling for HTTP Keep-Alive

## Example

```js
const https = require('https');
const { PollingManager, HttpsAgent } = require('@shuhei/pollen');

const dnsPolling = new PollingManager();
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
