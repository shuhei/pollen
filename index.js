const dns = require('dns');
const EventEmitter = require('events');
const OriginalHttpAgent = require('agentkeepalive');
const OriginalHttpsAgent = OriginalHttpAgent.HttpsAgent;

const RESOLVE_ERROR = 'resolve:error';
const RESOLVE_SUCCESS = 'resolve:success';

function randomlyPickOne(items) {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

class Poller extends EventEmitter {
  constructor(hostname, options = {}) {
    super();

    this.timer = null;

    this.hostname = hostname;
    this.interval = options.interval || 30 * 1000;
    this.retries = options.retries || 3;

    this.poll = this.poll.bind(this);

    // The initial `lookup` function just keeps callbacks instead of making DNS queries.
    // Callbacks are executed after the first successfull poll.
    this.pendingCallbacks = [];
    this.lookup = (hostname, options, callback) => {
      this.validateLookupArguments(hostname, options, callback);
      const cb = callback || options;
      this.pendingCallbacks.push(cb);
    };
  }

  poll(tries) {
    if (tries <= 0) {
      return;
    }
    const start = Date.now();
    dns.resolve4(this.hostname, (err, addresses) => {
      const duration = Date.now() - start;

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
        this.emit(RESOLVE_ERROR, {
          hostname: this.hostname,
          duration,
          error: err
        });
        this.poll(tries - 1);
        return;
      }

      const sortedAddresses = addresses.slice().sort();
      const key = sortedAddresses.join(',');
      const sameIPs = !!this.lookup && this.lookup.key === key;

      this.emit(RESOLVE_SUCCESS, {
        hostname: this.hostname,
        duration,
        update: !sameIPs
      });

      if (sameIPs) {
        // The same addresses are already cached.
        return;
      }

      this.lookup = (hostname, options, callback) => {
        this.validateLookupArguments(hostname, options, callback);
        const cb = callback || options;
        cb(null, randomlyPickOne(sortedAddresses), 4);
      }
      this.lookup.key = key;
    });
  }

  validateLookupArguments(hostname, options, callback) {
    const cb = callback || options;
    if (typeof cb !== 'function') {
      throw new TypeError('Invalid arguments: callback must be passed');
    }
    if (typeof hostname !== 'string') {
      throw new TypeError('Invalid arguments: hostname must be passed');
    }
    if (hostname !== this.hostname) {
      throw new Error(`Invalid lookup: expected ${this.hostname} but got ${hostname}`);
    }
  }

  start() {
    if (this.timer) {
      return this;
    }
    this.poll(this.retries);
    this.timer = setInterval(this.poll, this.interval, this.retries);
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

class DnsPolling extends EventEmitter {
  constructor(options) {
    this.pollers = new Map();
    this.options = options;
  }

  getLookup(hostname) {
    let poller = this.pollers.get(hostname);
    if (!poller) {
      poller = new Poller(hostname, this.options).start();
      this.forwardEvents(poller);
      this.pollers.set(hostname, poller);
    }
    return poller.getLookup();
  }

  forwardEvents(poller) {
    for (event of [RESOLVE_SUCCESS, RESOLVE_ERROR]) {
      const forward = (payload) => this.emit(event, payload);
      poller.on(event, forward);
    }
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
