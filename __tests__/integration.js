const http = require("http");
const dns = require("dns");
const dgram = require("dgram");
const DnsPacket = require("native-dns-packet");
const { HttpAgent, DnsPolling } = require("..");

function createHttpServer(host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(host);
    });
    server.listen(null, host, () => {
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

  it("allows a single HTTP request", done => {
    dnsServer.getResponse.mockImplementation(req => {
      const res = {
        ...req,
        qr: 1,
        answer: req.question.map(q => ({
          name: q.name,
          type: q.type,
          class: q.class,
          ttl: 1000,
          address: "127.0.0.1"
        }))
      };
      return res;
    });
    const polling = new DnsPolling();
    const agent = new HttpAgent();

    const hostname = "pollen.com";
    const req = http.get({
      hostname,
      port: httpServer1.address().port,
      agent,
      lookup: polling.getLookup(hostname)
    });
    req.on("response", res => {
      expect(res.statusCode).toBe(200);
      const chunks = [];
      res.on("data", chunk => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        expect(body).toBe("127.0.0.1");
        done();
      });
    });
    req.on("error", done.fail);
    req.end();
  });
});
