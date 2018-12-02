const http = require("http");
const dns = require("dns");
const dgram = require("dgram");
const DnsPacket = require("native-dns-packet");
const { HttpAgent, DnsPolling } = require("..");

const HTTP_PORT = 8989;

function createHttpServer(host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(host);
    });
    server.listen(HTTP_PORT, host, () => {
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
  beforeEach(async () => {
    httpServer1 = await createHttpServer("127.0.0.1");
    httpServer2 = await createHttpServer("127.0.0.2");
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
      port: HTTP_PORT,
      agent,
      lookup: polling.getLookup(hostname)
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("127.0.0.1");
  });

  it("switches two servers when DNS answer changes", async () => {
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.1"));
    dnsServer.getResponse.mockImplementationOnce(replyWithAddress("127.0.0.2"));
    const polling = new DnsPolling({
      interval: 100
    });
    const agent = new HttpAgent();

    const hostname = "pollen.com";
    const res1 = await getHttp({
      hostname,
      port: HTTP_PORT,
      agent,
      lookup: polling.getLookup(hostname)
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.body).toBe("127.0.0.1");

    await wait(150);

    const res2 = await getHttp({
      hostname,
      port: HTTP_PORT,
      agent,
      lookup: polling.getLookup(hostname)
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toBe("127.0.0.2");

    expect(Object.keys(agent.freeSockets)).toEqual([
      "pollen.com:8989:",
      "127.0.0.2:pollen.com:8989:"
    ]);
    expect(agent.freeSockets[`pollen.com:${HTTP_PORT}:`]).toHaveLength(1);
    expect(
      agent.freeSockets[`127.0.0.2:pollen.com:${HTTP_PORT}:`]
    ).toHaveLength(1);
  });
});
