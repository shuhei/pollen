jest.mock('../poller', () => {
  const EventEmitter = require('events');
  class MockPoller extends EventEmitter {
  }
  MockPoller.prototype.start = jest.fn().mockReturnThis();
  MockPoller.prototype.stop = jest.fn();
  MockPoller.prototype.getLookup = jest.fn();
  return MockPoller;
});

const {
  DnsPolling,
  Poller,
} = require('..');

describe('DnsPolling', () => {
  it('calls start, getLookup and stop of pollers', () => {
    const polling = new DnsPolling();

    const lookupFoo = polling.getLookup('foo.com');
    const lookupBar = polling.getLookup('bar.com');
    expect(Poller.prototype.start).toHaveBeenCalledTimes(2);
    expect(Poller.prototype.getLookup).toHaveBeenCalledTimes(2);

    polling.stop();
    expect(Poller.prototype.stop).toHaveBeenCalledTimes(2);
  });

  it('forwards resolve success and error events from pollers', (done) => {
    const polling = new DnsPolling();
    const successPayload = { dummy: 'success' };
    const errorPayload = { dummy: 'error' };
    const onResolveSuccess = jest.fn();
    const onResolveError = jest.fn();
    polling.once('resolve:success', onResolveSuccess);
    polling.once('resolve:error', onResolveError);

    const lookupFoo = polling.getLookup('foo.com');
    const poller = polling.pollers.get('foo.com');
    poller.emit('resolve:success', successPayload);
    poller.emit('resolve:error', errorPayload);

    process.nextTick(() => {
      expect(onResolveSuccess).toHaveBeenCalledTimes(1);
      expect(onResolveSuccess).toHaveBeenCalledWith(successPayload);
      expect(onResolveError).toHaveBeenCalledTimes(1);
      expect(onResolveError).toHaveBeenCalledWith(errorPayload);
      done();
    });
  });

  it('does not forward unknown events', (done) => {
    const polling = new DnsPolling();
    const lookupFoo = polling.getLookup('foo.com');
    const onFoo = jest.fn();
    polling.on('foo', onFoo);

    const poller = polling.pollers.get('foo.com');
    poller.emit('foo');

    process.nextTick(() => {
      expect(onFoo).not.toHaveBeenCalled();
      done();
    });
  });
});
