import { Blockchain, Container, P2P } from "@arkecosystem/core-interfaces";
import { Interfaces } from "@arkecosystem/crypto";
import { AgentOptions } from "agent-base";
import { AsyncQueue } from "async";
import { EventEmitter } from "events";
import { SocksProxy } from "socks";
import { Url } from "url";

import SocketCluster from "socketcluster";
import * as SocketClusterClient from "socketcluster-client";

export interface IAgentOptions
    extends AgentOptions,
        IBaseAgentOptions,
        Partial<Omit<Url & SocksProxy, keyof IBaseAgentOptions>> {}

export interface IAppConfig {
    cli: { forger: { run: { plugins: { include: [string] } } } };
}

export interface IBaseAgentOptions {
    host?: string | null;
    port?: string | number | null;
    username?: string | null;
}

export interface IBlockchain extends Blockchain.IBlockchain {
    enqueueBlocks: (blocks: Interfaces.IBlockData[]) => void;
    queue: AsyncQueue<any>;
}

export interface IBlockResponse {
    data: Interfaces.IBlockData[];
}

export interface IBlocks {
    height: number;
    blocks: {};
}

export interface ICommunicator extends P2P.IPeerCommunicator {
    _getPeerBlocks: (
        peer: P2P.IPeer,
        { fromBlockHeight, blockLimit, headersOnly }
    ) => Promise<Interfaces.IBlockData[]>;
    connector: IConnector;
    emit: (peer: P2P.IPeer, event: string, data: object, timeout: number) => Promise<P2P.IPeer[]>;
}

export interface IConnector extends P2P.IPeerConnector {
    create: (peer: P2P.IPeer | { ip: string; port: number }) => SocketClusterClient.SCClientSocket;
    terminate: (peer: P2P.IPeer) => void;
}

export interface IModule {
    start(): Promise<void>;
    stop?(): Promise<void>;
}

export interface IMonitor extends P2P.INetworkMonitor {
    communicator?: ICommunicator;
    connector?: IConnector;
    downloadedChunksCacheMax?: number;
    processor?: P2P.IPeerProcessor;
    populateSeedPeers?: () => Promise<void>;
    storage?: P2P.IPeerStorage;
}

export interface IOptions extends Container.IPluginOptions {
    apiSync: boolean;
    enabled: boolean | "ifDelegate";
    fetchTransactions: boolean;
    socket: string;
    tor: {
        enabled: boolean;
        instances: {
            max: number;
            min: number;
        };
        path: string;
    };
}

export interface IP2P extends IModule {
    init: () => void;
}

export interface IPackage {
    name: string;
}

export interface IProcess {
    name: string;
    pm2_env: { status };
}

export interface ISocketCluster extends SocketCluster {
    _launchWorkerCluster?: () => void;
    workerCluster?: EventEmitter;
}

export interface IWorkerOptions {
    oldCwd: string;
    oldWorkerController: string;
}
