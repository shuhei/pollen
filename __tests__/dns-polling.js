jest.mock('../poller', () => {
  const EventEmitter = require('events');
  class MockPoller extends EventEmitter {
  }
  MockPoller.prototype.start = jest.fn().mockReturnThis();
  MockPoller.prototype.stop = jest.fn();
  MockPoller.prototype.getLookup = jest.fn();
  return MockPoller;
});

const { DnsPolling, Poller } = require('..');

describe('DnsPolling', () => {
  it('calls start, getLookup and stop of poller', () => {
    const polling = new DnsPolling();

    const lookupFoo = polling.getLookup('foo.com');
    const lookupBar = polling.getLookup('bar.com');
    expect(Poller.prototype.start).toHaveBeenCalledTimes(2);
    expect(Poller.prototype.getLookup).toHaveBeenCalledTimes(2);

    polling.stop();
    expect(Poller.prototype.stop).toHaveBeenCalledTimes(2);
  });

  it('forwards events from pollers', (done) => {
    const polling = new DnsPolling();
    const successPayload = { dummy: 'success' };
    const errorPayload = { dummy: 'error' };
    let successCalled = false;
    polling.once('resolve:success', (payload) => {
      expect(payload).toBe(successPayload);
      successCalled = true;
    });
    polling.once('resolve:error', (payload) => {
      expect(payload).toBe(errorPayload);
      expect(successCalled).toBe(true);
      done();
    });
    const lookupFoo = polling.getLookup('foo.com');
    const poller = polling.pollers.get('foo.com');

    poller.emit('resolve:success', successPayload);
    poller.emit('resolve:error', errorPayload);
  });
});
