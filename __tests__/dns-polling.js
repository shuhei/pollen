jest.mock('../poller', () => {
  const EventEmitter = require('events');
  return jest.fn(() => {
    const lookup = jest.fn();
    return {
      start: jest.fn().mockReturnThis(),
      stop: jest.fn(),
      getLookup: jest.fn().mockReturnValue(lookup),
      ...EventEmitter.prototype
    };
  });
});

const {
  DnsPolling,
  Poller,
} = require('..');

describe('DnsPolling', () => {
  let polling;

  beforeEach(() => {
    polling = new DnsPolling();
  });

  afterEach(() => {
    polling.stop();
  });

  describe('getLookup', () => {
    it('returns a lookup function for each hostname', () => {
      const lookupFoo1 = polling.getLookup('foo.com');
      const lookupFoo2 = polling.getLookup('foo.com');
      const lookupBar = polling.getLookup('bar.com');

      expect(lookupFoo1).not.toBe(lookupBar);
      expect(lookupFoo2).not.toBe(lookupBar);
      expect(lookupFoo1).toBe(lookupFoo2);
      expect(typeof lookupFoo1).toBe('function');
      expect(typeof lookupFoo2).toBe('function');
      expect(typeof lookupBar).toBe('function');
    });

    it('creates a poller for each hostname', () => {
      polling.getLookup('foo.com');
      polling.getLookup('bar.com');

      const fooPoller1 = polling.pollers.get('foo.com');
      const barPoller = polling.pollers.get('bar.com');
      expect(fooPoller1).not.toBe(barPoller);

      polling.getLookup('foo.com');
      const fooPoller2 = polling.pollers.get('foo.com');
      expect(fooPoller2).toBe(fooPoller1);
    });

    it('calls start and stop of pollers', () => {
      polling.getLookup('foo.com');

      const poller = polling.pollers.get('foo.com');
      expect(poller.start).toHaveBeenCalledTimes(1);
      expect(poller.getLookup).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('calls stop of pollers', () => {
      polling.getLookup('foo.com');
      const poller = polling.pollers.get('foo.com');
      expect(poller.stop).not.toHaveBeenCalled();

      polling.stop();

      expect(poller.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('event forwarding', () => {
    it('forwards resolve success and error events from pollers', (done) => {
      const successPayload = { dummy: 'success' };
      const errorPayload = { dummy: 'error' };
      const onResolveSuccess = jest.fn();
      const onResolveError = jest.fn();
      polling.once('resolve:success', onResolveSuccess);
      polling.once('resolve:error', onResolveError);

      polling.getLookup('foo.com');
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
      polling.getLookup('foo.com');
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
});
