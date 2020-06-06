import { Agent as AgentBase, ClientRequest, RequestOptions } from "agent-base";
import { Socket } from "net";
import { SocksClient, SocksClientOptions, SocksProxy } from "socks";
import { IAgentOptions } from "./interfaces";

export class Agent extends AgentBase {
    private proxy: SocksProxy;

    constructor(opts: IAgentOptions) {
        super(opts);
        this.proxy = { host: opts.host, port: 0, type: 5 };
    }

    public async callback(req: ClientRequest, opts: RequestOptions): Promise<Socket> {
        const { proxy }: Agent = this;
        const { host, port }: IAgentOptions = opts;

        const socksOpts: SocksClientOptions = {
            command: "connect",
            destination: { host, port },
            proxy,
            socket_options: { path: proxy.host }
        };

        return (await SocksClient.createConnection(socksOpts)).socket;
    }
}
