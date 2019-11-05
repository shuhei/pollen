const http = require("http");
const dns = require("dns");
const net = require("net");
const dgram = require("dgram");
const DnsPacket = require("native-dns-packet");
const { HttpAgent, DnsPolling } = require("..");

function createHttpServer(port, host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(host);
    });
    server.listen(port, host, () => {
      resolve(server);
    });
    server.on("error", err => {
      reject(err);
    });
    // http.Server.close() waits until all connections are gone.
    // The default value of server.keepAliveTimeout is 5 seconds.
    // To make it fast to close in the teardown step, setting a shorter timeout.
    server.keepAliveTimeout = 500;
  });
}

function createDnsServer() {
  const getResponse = jest.fn();
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.on("error", err => {
      reject(err);
      socket.close();
    });
    socket.on("message", (msg, rinfo) => {
      const req = DnsPacket.parse(msg);
      const res = getResponse(req);
      if (res) {
        const buffer = Buffer.alloc(4096);
        const size = DnsPacket.write(buffer, res);
        socket.send(buffer, 0, size, rinfo.port, rinfo.address);
      }
    });
    socket.on("listening", () => {
      resolve({
        socket,
        getResponse
      });
    });
    socket.bind();
  });
}

async function getHttp(options) {
  return new Promise((resolve, reject) => {
    const req = http.get(options);
    req.on("response", res => {
      const chunks = [];
      res.on("data", chunk => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function replyWithAddress(address) {
  return req => {
    const res = {
      ...req,
      qr: 1,
      answer: req.question.map(q => ({
        name: q.name,
        type: q.type,
        class: q.class,
        ttl: 1000,
        address
      }))
    };
    return res;
  };
}

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

describe("Integration", () => {
  let httpServer1;
  let httpServer2;
  let dnsServer;
  let httpPort;

  beforeEach(async () => {
    // Start an HTTP server with an open port.
    httpServer1 = await createHttpServer(undefined, "127.0.0.1");
    httpPort = httpServer1.address().port;
    expect(typeof httpPort).toBe('number');

    // Use the same port as the first HTTP server.
    httpServer2 = await createHttpServer(httpPort, "127.0.0.2");
    dnsServer = await createDnsServer();
    dns.setServers([`127.0.0.1:${dnsServer.socket.address().port}`]);
  });

  afterEach(done => {
    let count = 0;
    function onClose() {
      count += 1;
      if (count === 3) {
        done();
      }
    }
    httpServer1.close(onClose);
    httpServer2.close(onClose);
    dnsServer.socket.close(onClose);
  });

  it("allows a single HTTP request", async () => {
    dnsServer.getResponse.mockImplementation(replyWithAddress("127.0.0.1"));
    const polling = new DnsPolling();
    const agent = new HttpAgent();

    const hostname = "pollen.com";
    const res = await getHttp({
      hostname,
      port: httpPort,
      agent,
      lookup: polling.getLookup(hostname)
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("127.0.0.1");
  });

  it("switches two servers while keeping connections to both in agent when DNS answer changes", async () => {
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.1"));
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.2"));
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.1"));
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.1"));
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.2"));

    const polling = new DnsPolling({
      interval: 100
    });
    const agent = new HttpAgent();
    const createConnection = jest.spyOn(agent, "createConnection");

    async function getAndAssert(body) {
      const hostname = "pollen.com";
      const res = await getHttp({
        hostname,
        port: httpPort,
        agent,
        lookup: polling.getLookup(hostname)
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(body);
    }

    // Expecting DNS polling to finish in 50 ms.
    const bufferForDns = 50;
    const afterFirstInterval = wait(100 + bufferForDns);
    const afterSecondInterval = wait(200 + bufferForDns);
    const afterThirdInterval = wait(300 + bufferForDns);
    const afterFourthInterval = wait(400 + bufferForDns);

    // Expecting 2 batches of HTTP requests to finish in 50 ms.
    await Promise.all([getAndAssert("127.0.0.1"), getAndAssert("127.0.0.1")]);
    await Promise.all([getAndAssert("127.0.0.1"), getAndAssert("127.0.0.1")]);
    await afterFirstInterval;
    await Promise.all([getAndAssert("127.0.0.2"), getAndAssert("127.0.0.2")]);
    await Promise.all([getAndAssert("127.0.0.2"), getAndAssert("127.0.0.2")]);
    await afterSecondInterval;
    await Promise.all([getAndAssert("127.0.0.1"), getAndAssert("127.0.0.1")]);
    await Promise.all([getAndAssert("127.0.0.1"), getAndAssert("127.0.0.1")]);
    await afterThirdInterval;
    await Promise.all([getAndAssert("127.0.0.1"), getAndAssert("127.0.0.1")]);
    await Promise.all([getAndAssert("127.0.0.1"), getAndAssert("127.0.0.1")]);
    await afterFourthInterval;
    await Promise.all([getAndAssert("127.0.0.2"), getAndAssert("127.0.0.2")]);
    await Promise.all([getAndAssert("127.0.0.2"), getAndAssert("127.0.0.2")]);

    expect(dnsServer.getResponse).toHaveBeenCalledTimes(5);
    // Make sure that persistent connections are used.
    expect(createConnection.mock.calls.map(args => args[0]._agentKey)).toEqual([
      `pollen.com:${httpPort}:`,
      `pollen.com:${httpPort}:`,
      `127.0.0.1:pollen.com:${httpPort}:`,
      `127.0.0.1:pollen.com:${httpPort}:`,
      `127.0.0.2:pollen.com:${httpPort}:`,
      `127.0.0.2:pollen.com:${httpPort}:`
    ]);
  });
});
