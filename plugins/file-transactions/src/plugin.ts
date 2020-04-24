import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers } from "@arkecosystem/crypto";
import IPFS from "ipfs";
import path from "path";

import { defaults } from "./defaults";
import { SetFileTransactionHandler } from "./handlers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "file-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Module File Transactions");
        Handlers.Registry.registerTransactionHandler(SetFileTransactionHandler);
        const ipfsHashes = [];
        let ipfs;
        const loadIpfsHashes = async (delegates: State.IWallet[]) => {
            const newIpfsHashes = [];
            const ipfsIndex = {};
            for (const delegate of delegates) {
                if (delegate.hasAttribute("files")) {
                    const dIpfs = delegate.getAttribute("files");
                    const delegateIpfs: string[] = Object.values(dIpfs);
                    const fileKeys = Object.keys(dIpfs);
                    // Get all ipfs hashes from all delegates and store it in newIpfsHashes[]
                    let i = 0;
                    for (const hash of delegateIpfs) {
                        newIpfsHashes.push(hash);
                        ipfsIndex[hash] = fileKeys[i];
                        i++;
                    }
                }
            }

            // Pin all new hashes that didn't exist previously
            for (const hash of newIpfsHashes) {
                if (hash && ipfsHashes.indexOf(hash) < 0) {
                    try {
                        const files = await ipfs.files.ls(`/ipfs/${hash}`);
                        const stat = await ipfs.files.stat(`/ipfs/${hash}`);
                        let fileSizeKey = ipfsIndex[hash];
                        if (String(fileSizeKey).startsWith("db.")) {
                            fileSizeKey = "db";
                        }
                        const maxFileSize = Managers.configManager.getMilestone().ipfs.maxFileSize[fileSizeKey];
                        if (stat && stat.cumulativeSize <= maxFileSize && files && files.length === 1) {
                            await ipfs.pin.add(hash);
                            ipfsHashes.push(hash);
                            container.resolvePlugin<Logger.ILogger>("logger").info(`IPFS File added ${hash}`);
                        }
                    } catch (error) {
                        container.resolvePlugin<Logger.ILogger>("logger").error(error);
                    }
                }
            }

            // Unpin all ipfs hashes that no longer exist in new ipfs hashes
            for (const hash of ipfsHashes) {
                if (hash && newIpfsHashes.indexOf(hash) < 0) {
                    await ipfs.pin.rm(hash);
                    delete ipfsHashes[ipfsHashes.indexOf(hash)];
                    container.resolvePlugin<Logger.ILogger>("logger").info(`IPFS File removed ${hash}`);
                }
            }
        };

        // Setup IPFS node ApplicationEvents.ForgerStarted
        emitter.on(ApplicationEvents.ForgerStarted, async forger => {
            const db = app.resolvePlugin<Database.IDatabaseService>("database");
            const delegateKeys = forger.activeDelegates;
            const delegates = [];
            for (const key of delegateKeys) {
                delegates.push(db.walletManager.findByPublicKey(key));
            }

            /*
             * IPFS configuration & init
             */

            // Set node config
            const ipfsPath = path.resolve(__dirname, `../.ipfs`);

            // Start IPFS node
            ipfs = await IPFS.create({
                repo: ipfsPath,
                config: {
                    Addresses: {
                        Swarm: [`/ip4/0.0.0.0/tcp/${options.port}`, `/ip4/127.0.0.1/tcp/${options.wsPort}/ws`],
                    },
                },
            });

            // Load hashes
            await loadIpfsHashes(delegates);
        });

        emitter.on("block.applied", async (blockData: Interfaces.IBlockData) => {
            const db = app.resolvePlugin<Database.IDatabaseService>("database");
            const isNewRound = roundCalculator.isNewRound(blockData.height);
            // Only load new hashes if new round, or each block when running testnet.
            if (ipfs && (isNewRound || Managers.configManager.get("network.name") === "testnet")) {
                const delegates = await db.getActiveDelegates();
                const delegateWallets = [];
                for (const delegate of delegates) {
                    const dWallet = db.walletManager.findByPublicKey(delegate.publicKey);
                    delegateWallets.push(dWallet);
                }
                await loadIpfsHashes(delegateWallets);
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering File Transactions");
        Handlers.Registry.deregisterTransactionHandler(SetFileTransactionHandler);
    },
};

export { SetFileTransactionHandler };
