const { HttpAgent, HttpsAgent } = require("..");
const OriginalHttpAgent = require("agentkeepalive");

const tests = [
  { name: "HttpAgent", Agent: HttpAgent, OriginalAgent: OriginalHttpAgent },
  {
    name: "HttpsAgent",
    Agent: HttpsAgent,
    OriginalAgent: OriginalHttpAgent.HttpsAgent
  }
];
for (const { name, Agent, OriginalAgent } of tests) {
  describe(name, () => {
    const agent = new Agent();
    const originalAgent = new OriginalAgent();

    describe("getName", () => {
      it("works same as the original agent if lookup function is not set", () => {
        const options = {
          host: "example.com",
          port: 80
        };
        expect(agent.getName(options)).toBe(originalAgent.getName(options));
      });

      it("works same as the original agent if lookup function does not have a key", () => {
        const options = {
          host: "example.com",
          port: 80,
          lookup: jest.fn()
        };
        expect(agent.getName(options)).toBe(originalAgent.getName(options));
      });

      it("appends the lookup key if set", () => {
        const lookup = jest.fn();
        lookup.key = "1.1.1.1,2.2.2.2";
        const options = {
          host: "example.com",
          port: 80,
          lookup
        };
        expect(agent.getName(options)).toBe(
          `${lookup.key}:${originalAgent.getName(options)}`
        );
      });
    });
  });
}
