jest.mock('dns', () => ({
  resolve4: jest.fn()
}));

const dns = require('dns');

const { Poller } = require('..');

describe('initial lookup', () => {
  let poller;
  let initialLookup;

  beforeEach(() => {
    poller = new Poller('example.com');
    initialLookup = poller.getLookup();
  });

  afterEach(() => {
    poller.stop();
  });

  it('throws when a hostname is not given', () => {
    expect(() => {
      initialLookup(undefined, jest.fn());
    }).toThrowError('Invalid arguments: hostname must be passed');
  });

  it('throws when a callback is not given', () => {
    expect(() => {
      initialLookup('example.com');
    }).toThrowError('Invalid arguments: callback must be passed');
  });

  it('throws when another hostname is given', () => {
    expect(() => {
      initialLookup('another.com', jest.fn());
    }).toThrowError('Invalid lookup: expected example.com but got another.com');
  });

  it('calls the callback with one of the addresses returned by dns.resolve4', (done) => {
    const addresses = ['1.1.1.1', '2.2.2.2'];
    dns.resolve4.mockImplementation((hostname, callback) => {
      expect(hostname).toBe('example.com');
      callback(null, addresses);
    });

    initialLookup('example.com', (err, address, family) => {
      expect(err).toBe(null);
      expect(addresses).toContain(address);
      expect(family).toBe(4);
      done();
    });
    poller.start();
  });

  it('calls the callback with the error returned by dns.resolve4', (done) => {
    const errorFromResolve4 = new Error('some error');
    dns.resolve4.mockImplementation((hostname, callback) => {
      callback(errorFromResolve4);
    });

    initialLookup('example.com', (err, address, family) => {
      expect(err).toBe(errorFromResolve4);
      expect(address).toBe(undefined);
      expect(family).toBe(undefined);
      done();
    });
    poller.start();
  });

  it('calls dns.resolve4 only once', (done) => {
    const addresses = ['1.1.1.1', '2.2.2.2'];
    dns.resolve4.mockImplementation((hostname, callback) => {
      callback(null, addresses);
    });

    let called = 0;
    for (let i = 0; i < 3; i++) {
      initialLookup('example.com', (err, address, family) => {
        expect(err).toBe(null);
        expect(addresses).toContain(address);
        expect(family).toBe(4);
        called += 1;
        if (called === 3) {
          expect(dns.resolve4).toHaveBeenCalledTimes(1);
          done();
        }
      });
    }
    poller.start();
  });
});
