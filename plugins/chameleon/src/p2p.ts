import { app } from "@arkecosystem/core-container";
import {
    Database,
    EventEmitter,
    Logger,
    P2P as CoreP2P,
    State,
    TransactionPool
} from "@arkecosystem/core-interfaces";
import { httpie } from "@arkecosystem/core-utils";
import { isBlockChained } from "@arkecosystem/core-utils/dist/is-block-chained";
import { Blocks, Crypto, Interfaces } from "@arkecosystem/crypto";
import { existsSync, unlinkSync } from "fs";
import { Agent } from "./agent";
import {
    IBlockchain,
    IBlockResponse,
    IBlocks,
    ICommunicator,
    IConnector,
    IModule,
    IMonitor,
    IOptions,
    ISocketCluster
} from "./interfaces";

import delay from "delay";
import http from "http";
import shuffle from "lodash.shuffle";
import pluralize from "pluralize";
import * as SocketClusterClient from "socketcluster-client";

export class P2P implements IModule {
    private readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<
        EventEmitter.EventEmitter
    >("event-emitter");
    private readonly logger: Logger.ILogger = app.resolvePlugin<Logger.ILogger>("logger");
    private readonly monitor: IMonitor = app
        .resolvePlugin<CoreP2P.IPeerService>("p2p")
        .getMonitor();
    private readonly communicator: ICommunicator = this.monitor.communicator;
    private readonly connector: IConnector = this.monitor.communicator.connector;
    private readonly options: IOptions;
    private readonly processor: CoreP2P.IPeerProcessor = this.monitor.processor;
    private readonly server: ISocketCluster = this.monitor.getServer();
    private readonly storage: CoreP2P.IPeerStorage = this.monitor.storage;

    private abort: boolean = false;
    private agent: http.Agent[] = [];
    private blockchain: IBlockchain;
    private database: Database.IDatabaseService;
    private discoveringPeers: boolean = false;
    private fetchingTransactions: boolean = false;
    private local: SocketClusterClient.SCClientSocket;
    private pool: TransactionPool.IConnection;
    private stateStore: State.IStateStore;
    private txIds: object = {};

    public constructor(options: IOptions) {
        this.options = options;
    }

    public init(): void {
        this.emitter.on("Chameleon.P2P.TorReady", (instance: number): void => {
            this.agent.push(
                new Agent({ host: `${process.env.CORE_PATH_TEMP}/tor/${instance}/socks.sock` })
            );
        });

        if (existsSync(this.options.socket)) {
            unlinkSync(this.options.socket);
        }

        delete this.server.options.host;
        // @ts-ignore
        this.server.options.port = this.options.socket;
        this.server.options.path = "/";
        this.server.options.oldCwd = process.cwd();
        this.server.options.oldWorkerController = this.server.options.workerController;
        this.server.options.workerController = __dirname + "/worker.js";
        this.server.workerCluster.removeAllListeners("exit");
        this.server.killWorkers({ killClusterMaster: true });
        this.server._launchWorkerCluster();
    }

    public async start(): Promise<void> {
        this.logger.info("Your true IP address will not be visible in any peer lists");
        this.logger.info(
            `The P2P Interface port (${
                app.resolveOptions("p2p").server.port
            }) has been closed successfully`
        );

        this.override();

        this.local = this.connector.create({ ip: "127.0.0.1", port: 0 });

        while (!app.resolvePlugin<IBlockchain>("blockchain")) {
            await delay(100);
        }

        this.blockchain = app.resolvePlugin<IBlockchain>("blockchain");

        while (!this.blockchain.state || !this.blockchain.state.started) {
            await delay(100);
        }

        this.database = app.resolvePlugin<Database.IDatabaseService>("database");
        this.stateStore = app.resolvePlugin<State.IStateService>("state").getStore();

        if (this.options.fetchTransactions) {
            this.pool = app.resolvePlugin<TransactionPool.IConnection>("transaction-pool");
            setInterval(() => this.clearTransactions(), 60000);
        }

        this.emitter.on("Chameleon.P2P.LastBlockHeight", (block: { height: number }): void => {
            block.height = this.stateStore ? this.stateStore.getLastBlock().data.height : 0;
        });

        this.download();

        setInterval(() => this.checkPeersAndTransactions(), 2000);
        setInterval(() => this.discoverPeers(), 10000);
    }

    private async checkPeersAndTransactions(): Promise<void> {
        const peers: CoreP2P.IPeer[] = this.storage.getPeers();
        if (peers.length < app.resolveOptions("p2p").minimumNetworkReach) {
            await this.monitor.populateSeedPeers();
            this.discoverPeers();
            return;
        }
        if (this.pool && !this.fetchingTransactions) {
            const slicedPeers: CoreP2P.IPeer[] = shuffle(
                peers.filter(
                    (peer: CoreP2P.IPeer) =>
                        !isNaN(peer.ports["@arkecosystem/core-api"]) &&
                        peer.ports["@arkecosystem/core-api"] > -1
                )
            ).slice(0, 10);
            if (slicedPeers.length > 0) {
                this.fetchTransactionsFromPeers(
                    slicedPeers.map(
                        (peer: CoreP2P.IPeer): string =>
                            `http://${peer.ip}:${peer.ports["@arkecosystem/core-api"]}/api/transactions/unconfirmed?transform=false`
                    )
                );
            }
        }
    }

    private clearTransactions(): void {
        const timeNow: number = new Date().getTime() / 1000;
        const txIds: string[] = Object.keys(this.txIds);
        for (const id of txIds) {
            if (timeNow - this.txIds[id] > 3600) {
                delete this.txIds[id];
            }
        }
    }

    private async discoverPeers(): Promise<void> {
        if (this.discoveringPeers) {
            return;
        }
        this.discoveringPeers = true;
        const allPeers: string[] = this.storage.getPeers().map((peer: CoreP2P.IPeer) => peer.ip);
        const peerList: CoreP2P.IPeer[] = shuffle(this.storage.getPeers())
            .filter(
                (peer: CoreP2P.IPeer) =>
                    !isNaN(peer.ports["@arkecosystem/core-api"]) &&
                    peer.ports["@arkecosystem/core-api"] > -1
            )
            .slice(0, 10);
        const newPeers: Map<string, CoreP2P.IPeer> = new Map();
        await Promise.all(
            peerList.map(async (peer: CoreP2P.IPeer) => {
                try {
                    const apiPort: number = peer.ports["@arkecosystem/core-api"];
                    const { body, status } = await httpie.get(
                        `http://${peer.ip}:${apiPort}/api/peers`,
                        { agent: this.getAgent() }
                    );
                    if (status === 200) {
                        const theirPeers: CoreP2P.IPeer[] = body.data;
                        for (const newPeer of theirPeers) {
                            newPeers.set(newPeer.ip, newPeer);
                        }
                    }
                } catch (error) {
                    //
                }
            })
        );

        const peersToAdd: CoreP2P.IPeer[] = Array.from(newPeers, ([key, value]) => value).filter(
            (peer: CoreP2P.IPeer) => !allPeers.includes(peer.ip)
        );
        await Promise.all(
            peersToAdd.map((peer: CoreP2P.IPeer) =>
                this.processor.validateAndAcceptPeer(peer, { lessVerbose: true })
            )
        );

        const addedIPs: string[] = peersToAdd.map((peer: CoreP2P.IPeer) => peer.ip);

        await Promise.all(
            this.storage.getPeers().map(async peer => {
                try {
                    if (addedIPs.includes(peer.ip)) {
                        await this.communicator.pingPorts(peer);
                    }
                } catch (error) {
                    return;
                }
            })
        );
        this.discoveringPeers = false;
    }

    private async download(): Promise<void> {
        const lastBlock: Interfaces.IBlockData = this.stateStore.getLastBlock().data;

        if (
            this.blockchain.queue.length() === 0 &&
            this.blockchain.state.blockchain.value === "idle"
        ) {
            this.abort = false;
            const peerList: CoreP2P.IPeer[] = shuffle(this.storage.getPeers());
            const peers: CoreP2P.IPeer[] = peerList
                .filter(
                    (peer: CoreP2P.IPeer): boolean =>
                        !peer.isForked() &&
                        !isNaN(peer.ports["@arkecosystem/core-api"]) &&
                        peer.ports["@arkecosystem/core-api"] > 0 &&
                        peer.ports["@arkecosystem/core-api"] < 65536
                )
                .slice(0, 5);
            if (peers.length > 0) {
                if (
                    !this.stateStore.lastDownloadedBlock ||
                    lastBlock.id === this.stateStore.lastDownloadedBlock.id
                ) {
                    const foundBlocks: IBlocks = {
                        height: lastBlock.height + 1,
                        blocks: {}
                    };
                    for (const peer of peers) {
                        if (this.abort) {
                            break;
                        }
                        this.getBlocks(
                            peer,
                            foundBlocks,
                            peers.length > 2 ? 2 : 1,
                            peer.ports["@arkecosystem/core-api"],
                            0
                        );
                    }
                }
            }
        }

        const nextExecutionTimeInMs: number = Math.max(
            500,
            (Crypto.Slots.getSlotTime(Crypto.Slots.getSlotNumber(lastBlock.timestamp) + 1) -
                Crypto.Slots.getTime()) *
                1000
        );
        setTimeout((): Promise<void> => this.download(), nextExecutionTimeInMs);
    }

    private async fetchTransactions(url: string, page: number): Promise<void> {
        try {
            const { body, status } = await httpie.get(`${url}&page=${page}`, {
                agent: this.getAgent()
            });
            if (status === 200) {
                const allTransactions: Interfaces.ITransactionData[] = body.data;
                if (allTransactions.length > 0) {
                    const transactionsToAdd: Interfaces.ITransactionData[] = [];
                    for (const transaction of allTransactions) {
                        const alreadyInPool: boolean = await this.pool.has(transaction.id);
                        const alreadyInBlockchain: boolean = !!(await this.database.transactionsBusinessRepository.findById(
                            transaction.id
                        ));
                        if (!alreadyInPool && !alreadyInBlockchain && !this.txIds[transaction.id]) {
                            transactionsToAdd.push(transaction);
                            this.txIds[transaction.id] = new Date().getTime() / 1000;
                        }
                    }

                    const bundledTransactions: Interfaces.ITransactionData[][] = [];
                    while (transactionsToAdd.length) {
                        bundledTransactions.push(
                            transactionsToAdd.splice(
                                0,
                                app.resolveOptions("transaction-pool").maxTransactionsPerRequest
                            )
                        );
                    }
                    for (const transactions of bundledTransactions) {
                        await new Promise((resolve): void => {
                            this.local.emit(
                                "p2p.peer.postTransactions",
                                {
                                    data: { transactions },
                                    headers: {
                                        "Content-Type": "application/json"
                                    }
                                },
                                async (): Promise<void> => {
                                    resolve();
                                }
                            );
                        });
                    }
                    if (
                        page < 100 &&
                        (body.meta.pageCount > page ||
                            body.meta.totalCount > allTransactions.length)
                    ) {
                        page++;
                        await this.fetchTransactions(url, page);
                    }
                }
            }
        } catch (error) {
            //
        }
    }

    private async fetchTransactionsFromPeers(urls: string[]): Promise<void> {
        if (this.fetchingTransactions) {
            return;
        }
        this.fetchingTransactions = true;
        for (const url of urls) {
            await this.fetchTransactions(url, 1);
        }
        this.fetchingTransactions = false;
    }

    private getAgent(): http.Agent {
        if (this.agent.length > 0) {
            return this.agent[Math.floor(Math.random() * this.agent.length)];
        } else {
            return http.globalAgent;
        }
    }

    private async getBlocks(
        peer: CoreP2P.IPeer,
        foundBlocks: IBlocks,
        minimumPeers: number,
        apiPort: number,
        height?: number
    ): Promise<Interfaces.IBlockData[]> {
        const lastBlock: Interfaces.IBlockData = this.stateStore.getLastBlock().data;
        if (
            height === 0 &&
            this.stateStore.lastDownloadedBlock &&
            lastBlock.id !== this.stateStore.lastDownloadedBlock.id
        ) {
            this.abort = true;
        }
        if (!this.abort || height > 0) {
            try {
                const { body, status } = await httpie.post(
                    `http://${peer.ip}:${apiPort}/api/blocks/search?transform=false`,
                    {
                        agent: this.getAgent(),
                        body: {
                            height: { from: height > 0 ? height : lastBlock.height + 1 },
                            timestamp: { from: 0, to: Math.floor(new Date().getTime() / 1000) },
                            orderBy: "height:asc"
                        }
                    }
                );
                if (status === 200 && (!this.abort || height > 0)) {
                    const blocks: Interfaces.IBlockData[] = body.data;
                    for (const block of blocks) {
                        if (
                            block.numberOfTransactions > 0 &&
                            block.numberOfTransactions <=
                                app.getConfig().getMilestone(block.height).block.maxTransactions
                        ) {
                            block.transactions = await this.getTransactions(
                                peer.ip,
                                apiPort,
                                block
                            );
                        }
                    }
                    const blocksToProcess: Interfaces.IBlockData[] = blocks.map(
                        (incomingBlock: Interfaces.IBlockData) => {
                            const block: Interfaces.IBlock = Blocks.BlockFactory.fromData(
                                incomingBlock,
                                { deserializeTransactionsUnchecked: true }
                            );
                            return {
                                ...block.data,
                                transactions: block.transactions.map(
                                    (transaction: Interfaces.ITransaction) => transaction.data
                                )
                            };
                        }
                    );
                    if (blocksToProcess.length > 0) {
                        if (height === 0) {
                            this.processBlocks(
                                { data: blocksToProcess },
                                peer,
                                foundBlocks,
                                minimumPeers
                            );
                        } else if (height > 0) {
                            return blocksToProcess;
                        }
                    }
                }
            } catch (error) {
                //
            }
        }
        return [];
    }

    private async getTransactions(
        ip: string,
        port: number,
        block: Interfaces.IBlockData
    ): Promise<Interfaces.ITransactionData[]> {
        const transactions: Interfaces.ITransactionData[] = [];
        const pages: number = Math.ceil(block.numberOfTransactions / 100);
        for (let page: number = 1; page <= pages; page++) {
            const { body, status } = await httpie.get(
                `http://${ip}:${port}/api/blocks/${block.height}/transactions?transform=false&limit=100&page=${page}`,
                { agent: this.getAgent() }
            );
            if (status === 200 && !this.abort) {
                transactions.push(...body.data);
            } else {
                break;
            }
        }
        return transactions;
    }

    private override(): void {
        const create: (
            peer: CoreP2P.IPeer | { ip: string; port: number }
        ) => SocketClusterClient.SCClientSocket = (
            peer: CoreP2P.IPeer
        ): SocketClusterClient.SCClientSocket => {
            const connection: SocketClusterClient.SCClientSocket = SocketClusterClient.create({
                port: peer.port,
                hostname: peer.ip,
                ackTimeout: Math.max(
                    app.resolveOptions("p2p").getBlocksTimeout,
                    app.resolveOptions("p2p").verifyTimeout
                ),
                perMessageDeflate: false,
                // @ts-ignore
                agent: peer.ip !== "127.0.0.1" ? this.getAgent() : undefined
            });
            // @ts-ignore
            const socket = connection.transport.socket;
            socket.on("ping", () => this.connector.terminate(peer));
            socket.on("pong", () => this.connector.terminate(peer));
            socket.on("message", (data: string) => {
                if (data === "#1") {
                    const timeNow: number = new Date().getTime();
                    socket._last10Pings = socket._last10Pings || [];
                    socket._last10Pings.push(timeNow);
                    if (socket._last10Pings.length >= 10) {
                        socket._last10Pings = socket._last10Pings.slice(
                            socket._last10Pings.length - 10
                        );
                        if (timeNow - socket._last10Pings[0] < 1000) {
                            this.connector.terminate(peer);
                        }
                    }
                }
            });
            connection.on("error", () => this.connector.disconnect(peer));
            return connection;
        };

        if (this.options.apiSync) {
            this.monitor.downloadedChunksCacheMax = 400;
        } else if (this.options.tor.enabled) {
            this.monitor.downloadedChunksCacheMax = 200;
        }

        this.monitor.downloadBlocksFromHeight = async function(
            fromBlockHeight: number,
            maxParallelDownloads: number = 10
        ): Promise<Interfaces.IBlockData[]> {
            const peersAll: CoreP2P.IPeer[] = this.storage.getPeers();

            if (peersAll.length === 0) {
                return [];
            }

            const peersNotForked: CoreP2P.IPeer[] = shuffle(
                peersAll.filter(peer => !peer.isForked())
            );

            if (peersNotForked.length === 0) {
                this.logger.error(
                    `Could not download blocks: We have ${pluralize(
                        "peer",
                        peersAll.length,
                        true
                    )} but all ` + `of them are on a different chain than us`
                );
                return [];
            }

            const networkHeight: number = this.getNetworkHeight();
            let chunkSize: number = 400;
            if (this.downloadedChunksCacheMax === 400) {
                chunkSize = 100;
            } else if (this.downloadedChunksCacheMax === 200) {
                chunkSize = 200;
            }
            let chunksMissingToSync: number;
            if (!networkHeight || networkHeight <= fromBlockHeight) {
                chunksMissingToSync = 1;
            } else {
                chunksMissingToSync = Math.ceil((networkHeight - fromBlockHeight) / chunkSize);
            }
            const chunksToDownload: number = Math.min(
                chunksMissingToSync,
                peersNotForked.length,
                maxParallelDownloads
            );

            const downloadJobs = [];
            const downloadResults = [];
            let someJobFailed: boolean = false;
            let chunksHumanReadable: string = "";

            for (let i = 0; i < chunksToDownload; i++) {
                const height: number = fromBlockHeight + chunkSize * i;
                const isLastChunk: boolean = i === chunksToDownload - 1;
                const blocksRange: string = `[${height + 1}, ${
                    isLastChunk ? ".." : height + chunkSize
                }]`;

                downloadJobs.push(async () => {
                    if (this.downloadedChunksCache[height] !== undefined) {
                        downloadResults[i] = this.downloadedChunksCache[height];
                        delete this.downloadedChunksCache[height];
                        return;
                    }

                    let blocks: Interfaces.IBlockData[];
                    let peer: CoreP2P.IPeer;
                    let peerPrint: string;

                    const peersToTry = [
                        peersNotForked[i],
                        ...shuffle(peersNotForked.slice(chunksToDownload))
                    ];

                    for (peer of peersToTry) {
                        peerPrint = `${peer.ip}:${
                            chunkSize === 100 &&
                            peer.ports["@arkecosystem/core-api"] &&
                            peer.ports["@arkecosystem/core-api"] !== -1
                                ? peer.ports["@arkecosystem/core-api"]
                                : peer.port
                        }`;
                        try {
                            blocks = await this.communicator.getPeerBlocks(peer, {
                                fromBlockHeight: height
                            });
                            if (blocks.length === chunkSize || (isLastChunk && blocks.length > 0)) {
                                this.logger.debug(
                                    `Downloaded blocks ${blocksRange} (${blocks.length}) ` +
                                        `from ${peerPrint}`
                                );
                                downloadResults[i] = blocks;
                                return;
                            }
                        } catch (error) {
                            //
                        }

                        if (someJobFailed) {
                            return;
                        }
                    }

                    someJobFailed = true;

                    return;
                });

                if (chunksHumanReadable.length > 0) {
                    chunksHumanReadable += ", ";
                }
                chunksHumanReadable += blocksRange;
            }

            this.logger.debug(`Downloading blocks in chunks: ${chunksHumanReadable}`);

            try {
                await Promise.all(downloadJobs.map(f => f()));
            } catch (error) {
                //
            }

            let downloadedBlocks: Interfaces.IBlockData[] = [];

            let i;

            for (i = 0; i < chunksToDownload; i++) {
                if (downloadResults[i] === undefined) {
                    break;
                }
                downloadedBlocks = [...downloadedBlocks, ...downloadResults[i]];
            }

            for (i++; i < chunksToDownload; i++) {
                if (
                    downloadResults[i] !== undefined &&
                    Object.keys(this.downloadedChunksCache).length <= this.downloadedChunksCacheMax
                ) {
                    this.downloadedChunksCache[fromBlockHeight + chunkSize * i] =
                        downloadResults[i];
                }
            }

            return downloadedBlocks;
        };

        this.communicator._getPeerBlocks = this.communicator.getPeerBlocks;
        this.communicator.getPeerBlocks = async (
            peer: CoreP2P.IPeer,
            {
                fromBlockHeight,
                blockLimit = this.options.tor.enabled ? 200 : 400,
                headersOnly
            }: { fromBlockHeight: number; blockLimit?: number; headersOnly?: boolean }
        ): Promise<Interfaces.IBlockData[]> => {
            if (!this.stateStore) {
                this.stateStore = app.resolvePlugin<State.IStateService>("state").getStore();
            }
            const port: number = peer.ports["@arkecosystem/core-api"];
            if (!this.options.apiSync || isNaN(port) || port === -1) {
                return this.communicator._getPeerBlocks(peer, {
                    fromBlockHeight,
                    blockLimit,
                    headersOnly
                });
            }
            return this.getBlocks(peer, { height: 0, blocks: [] }, 0, port, fromBlockHeight + 1);
        };

        this.connector.create = create;
    }

    private processBlocks(
        response: IBlockResponse,
        peer: CoreP2P.IPeer,
        foundBlocks: IBlocks,
        minimumPeers: number
    ): void {
        if (this.abort) {
            return;
        }
        const blocks: Interfaces.IBlockData[] = response.data;
        let lastBlock: Interfaces.IBlockData = this.stateStore.getLastBlock().data;
        if (
            blocks &&
            blocks.length > 0 &&
            this.blockchain.queue.length() === 0 &&
            this.blockchain.state.blockchain.value === "idle" &&
            isBlockChained(lastBlock, blocks[0])
        ) {
            for (const block of blocks) {
                if (!foundBlocks.blocks[block.id]) {
                    foundBlocks.blocks[block.id] = {};
                }
                foundBlocks.blocks[block.id][peer.ip] = true;
            }

            const blocksFromMultiplePeers: Interfaces.IBlockData[] = blocks.filter(
                (block): boolean =>
                    foundBlocks.blocks[block.id] &&
                    Object.keys(foundBlocks.blocks[block.id]).length >= minimumPeers
            );
            const chainedBlocks: Interfaces.IBlockData[] = [];

            for (const block of blocksFromMultiplePeers) {
                if (isBlockChained(lastBlock, block)) {
                    chainedBlocks.push(block);
                } else {
                    break;
                }
                lastBlock = block;
            }

            if (
                chainedBlocks.length > 0 &&
                !this.abort &&
                chainedBlocks[0].height === this.stateStore.getLastBlock().data.height + 1 &&
                this.blockchain.queue.length() === 0 &&
                this.blockchain.state.blockchain.value === "idle"
            ) {
                this.abort = true;
                if (chainedBlocks.length === 1) {
                    this.logger.info(
                        `Received new block at height ${chainedBlocks[0].height.toLocaleString()} with ${pluralize(
                            "transaction",
                            chainedBlocks[0].numberOfTransactions,
                            true
                        )} from ${peer.ip}`
                    );
                    this.blockchain.handleIncomingBlock(chainedBlocks[0], false);
                } else if (chainedBlocks.length > 1) {
                    this.blockchain.enqueueBlocks(chainedBlocks);
                    this.blockchain.dispatch("DOWNLOADED");
                }
            }
        }
    }
}
