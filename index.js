const EventEmitter = require("events");
const OriginalHttpAgent = require("agentkeepalive");
const OriginalHttpsAgent = OriginalHttpAgent.HttpsAgent;
const Poller = require("./poller");

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
    super();
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
    const events = ["resolve:success", "resolve:error"];
    for (const event of events) {
      const forward = payload => this.emit(event, payload);
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
  HttpsAgent
};
