const dns = require('dns');
const OriginalHttpAgent = require('agentkeepalive');
const OriginalHttpsAgent = OriginalHttpAgent.HttpsAgent;

function randomlyPickOne(items) {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

class Poller {
  constructor(hostname, options = {}) {
    this.timer = null;

    this.hostname = hostname;
    this.interval = options.interval || 30 * 1000;

    this.poll = this.poll.bind(this);

    this.pendingCallbacks = [];
    this.lookup = (hostname, options, callback) => {
      this.validateHostname(hostname);
      const cb = callback || options;
      this.pendingCallbacks.push(cb);
    };
  }

  poll() {
    dns.resolve4(this.hostname, (err, addresses) => {
      if (this.pendingCallbacks) {
        for (const pendingCallback of this.pendingCallbacks) {
          process.nextTick(() => {
            if (err) {
              pendingCallback(err);
            } else {
              pendingCallback(null, randomlyPickOne(addresses), 4);
            }
          });
        }
        this.pendingCallbacks = null;
      }

      if (err) {
        // TODO: Log error.
        return;
      }

      const sortedAddresses = addresses.slice().sort();
      const key = sortedAddresses.join(',');

      if (this.lookup && this.lookup.key === key) {
        // The same addresses are already cached.
        return;
      }

      this.lookup = (hostname, options, callback) => {
        this.validateHostname(hostname);
        const cb = callback || options;
        cb(null, randomlyPickOne(sortedAddresses), 4);
      }
      this.lookup.key = key;
    });
  }

  validateHostname(hostname) {
    if (hostname !== this.hostname) {
      throw new Error(`Invalid lookup: expected ${this.hostname} but got ${hostname}`);
    }
  }

  start() {
    if (this.timer) {
      return this;
    }
    this.poll();
    this.timer = setInterval(this.poll, this.interval);
    this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    return this;
  }

  getLookup() {
    return this.lookup;
  }
}

function extendAgent(OriginalAgent) {
  class DnsAgent extends OriginalAgent {
    getName(options) {
      const name = super.getName(options);
      const key = options.lookup && options.lookup.key;
      return key ? `${key}:${name}` : name;
    }
  }
  return DnsAgent;
}

class DnsPolling {
  constructor(options) {
    this.pollers = new Map();
    this.options = options;
  }

  getLookup(hostname) {
    let poller = this.pollers.get(hostname);
    if (!poller) {
      poller = new Poller(hostname, this.options).start();
      this.pollers.set(hostname, poller);
    }
    return poller.getLookup();
  }

  stop() {
    for (const poller of this.pollers.values()) {
      poller.stop();
    }
  }
}

const HttpAgent = extendAgent(OriginalHttpAgent);
const HttpsAgent = extendAgent(OriginalHttpsAgent);

module.exports = {
  Poller,
  DnsPolling,
  HttpAgent,
  HttpsAgent,
};
