jest.mock("dns", () => ({
  resolve4: jest.fn()
}));

const dns = require("dns");

const { Poller } = require("..");

describe("initial lookup", () => {
  let poller;
  let initialLookup;

  beforeEach(() => {
    poller = new Poller("example.com");
    initialLookup = poller.getLookup();
  });

  afterEach(() => {
    poller.stop();
  });

  it("throws when a hostname is not given", () => {
    expect(() => {
      initialLookup(undefined, jest.fn());
    }).toThrowError("Invalid arguments: hostname must be passed");
  });

  it("throws when a callback is not given", () => {
    expect(() => {
      initialLookup("example.com");
    }).toThrowError("Invalid arguments: callback must be passed");
  });

  it("throws when another hostname is given", () => {
    expect(() => {
      initialLookup("another.com", jest.fn());
    }).toThrowError("Invalid lookup: expected example.com but got another.com");
  });

  it("calls the callback with one of the addresses returned by dns.resolve4", done => {
    const addresses = ["1.1.1.1", "2.2.2.2"];
    dns.resolve4.mockImplementation((hostname, callback) => {
      expect(hostname).toBe("example.com");
      callback(null, addresses);
    });
    const onResolveSuccess = jest.fn();
    poller.on("resolve:success", onResolveSuccess);

    initialLookup("example.com", (err, address, family) => {
      expect(err).toBe(null);
      expect(addresses).toContain(address);
      expect(family).toBe(4);

      expect(onResolveSuccess).toHaveBeenCalledTimes(1);
      const payload = onResolveSuccess.mock.calls[0][0];
      expect(payload.hostname).toBe("example.com");
      expect(payload.update).toBe(true);
      expect(typeof payload.duration).toBe("number");

      done();
    });
    poller.start();
  });

  it("calls the callback with the error returned by dns.resolve4", done => {
    const errorFromResolve4 = new Error("some error");
    dns.resolve4.mockImplementation((hostname, callback) => {
      callback(errorFromResolve4);
    });
    const onResolveError = jest.fn();
    poller.on("resolve:error", onResolveError);

    initialLookup("example.com", (err, address, family) => {
      expect(err).toBe(errorFromResolve4);
      expect(address).toBe(undefined);
      expect(family).toBe(undefined);

      expect(onResolveError).toHaveBeenCalledTimes(3);
      for (const [payload] of onResolveError.mock.calls) {
        expect(payload.hostname).toBe("example.com");
        expect(payload.error).toBe(errorFromResolve4);
        expect(typeof payload.duration).toBe("number");
      }

      done();
    });
    poller.start();
  });

  it("calls dns.resolve4 only once", done => {
    const addresses = ["1.1.1.1", "2.2.2.2"];
    dns.resolve4.mockImplementation((hostname, callback) => {
      callback(null, addresses);
    });
    const onResolveSuccess = jest.fn();
    poller.on("resolve:success", onResolveSuccess);

    let called = 0;
    for (let i = 0; i < 3; i++) {
      initialLookup("example.com", (err, address, family) => {
        expect(err).toBe(null);
        expect(addresses).toContain(address);
        expect(family).toBe(4);
        called += 1;
        if (called === 3) {
          expect(dns.resolve4).toHaveBeenCalledTimes(1);
          expect(onResolveSuccess).toHaveBeenCalledTimes(1);
          done();
        }
      });
    }
    poller.start();
  });
});

describe("after a successful first poll", () => {
  const addresses = ["1.1.1.1", "3.3.3.3", "2.2.2.2"];
  let poller;
  let initialLookup;

  beforeEach(done => {
    poller = new Poller("example.com");

    dns.resolve4.mockImplementation((hostname, callback) => {
      process.nextTick(done);
      callback(null, addresses);
    });
    initialLookup = poller.getLookup();

    poller.start();
  });

  afterEach(() => {
    poller.stop();
  });

  it("sets a new lookup function with a key", () => {
    const lookup = poller.getLookup();
    expect(lookup).not.toBe(initialLookup);

    // The key should have sorted IP addresses.
    expect(lookup.key).toBe("1.1.1.1,2.2.2.2,3.3.3.3");

    const anotherLookup = poller.getLookup();
    expect(anotherLookup).toBe(lookup);
  });

  it("sets a new lookup function that keeps the result of dns.resolve4", done => {
    const lookup = poller.getLookup();

    expect(dns.resolve4).toHaveBeenCalledTimes(1);

    let called = 0;
    for (let i = 0; i < 3; i++) {
      lookup("example.com", (err, address, family) => {
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
  });
});

describe("when DNS resolver keeps failing", () => {
  let poller;
  let initialLookup;

  afterEach(() => {
    poller.stop();
  });

  it("tries 3 times and gives up", done => {
    poller = new Poller("example.com");
    initialLookup = poller.getLookup();

    const tries = 3;
    const errorFromResolve4 = new Error("some error");
    let called = 0;
    dns.resolve4.mockImplementation((hostname, callback) => {
      callback(errorFromResolve4);
      called += 1;
      if (called === tries) {
        process.nextTick(() => {
          expect(dns.resolve4).toHaveBeenCalledTimes(tries);
          expect(poller.getLookup()).toBe(initialLookup);
          done();
        });
      }
    });

    poller.start();
  });
});
