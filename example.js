const https = require('https');
const { DnsPolling, HttpsAgent } = require('.');

const pollingManager = new DnsPolling();
const agent = new HttpsAgent();

function makeRequest(hostname) {
  const req = https.get({
    hostname,
    path: '/',
    lookup: pollingManager.getLookup(hostname),
    agent,
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => {
      chunks.push(chunk);
    });
    res.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      console.log(hostname, req.socket.remoteAddress, res.statusCode, res.headers.date, body.length)
    });
    res.on('error', (err) => {
      console.error('res error', err);
    });
  });
  req.on('error', (err) => {
    console.error('req error', err);
  });
}
makeRequest('shuheikagawa.com');
makeRequest('github.com');
makeRequest('github.com');
setTimeout(() => {
  makeRequest('shuheikagawa.com');
  makeRequest('shuheikagawa.com');
  makeRequest('shuheikagawa.com');
  makeRequest('github.com');
  makeRequest('github.com');
  makeRequest('github.com');
}, 1000);
setTimeout(() => {
  makeRequest('shuheikagawa.com');
  makeRequest('shuheikagawa.com');
  makeRequest('shuheikagawa.com');
  makeRequest('github.com');
  makeRequest('github.com');
  makeRequest('github.com');
}, 2000);
setTimeout(() => {
  makeRequest('shuheikagawa.com');
  makeRequest('shuheikagawa.com');
  makeRequest('shuheikagawa.com');
  makeRequest('github.com');
  makeRequest('github.com');
  makeRequest('github.com');
}, 3000);
