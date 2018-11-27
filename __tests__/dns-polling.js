const { DnsPolling } = require('..');

describe('DnsPolling', () => {
  it('instantiates', () => {
    const polling = new DnsPolling();
    const lookupFoo = polling.getLookup('foo.com');
    const lookupBar = polling.getLookup('bar.com');
    polling.stop();
  });
});
