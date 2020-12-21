import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers } from "@arkecosystem/crypto";
import got from "got";
import IPFS from "ipfs";
import path from "path";
import { FileIndex, schemaIndexer } from "./wallet-manager";

import { defaults } from "./defaults";
import { SetFileTransactionHandler } from "./handlers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "file-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Module File Transactions");

        // Register schema indexer
        container
            .resolvePlugin<EventEmitter.EventEmitter>("event-emitter")
            .once(ApplicationEvents.StateStarting, (database: Database.IDatabaseService) => {
                const walletManager = database.walletManager;
                walletManager.registerIndex(FileIndex.Schemas, schemaIndexer);
            });

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
                        if (typeof hash === "object") {
                            for (const subHash of Object.values(hash)) {
                                newIpfsHashes.push(subHash);
                                ipfsIndex[subHash as string] = fileKeys[i];
                            }
                        } else {
                            newIpfsHashes.push(hash);
                            ipfsIndex[hash] = fileKeys[i];
                            i++;
                        }
                    }
                }
            }

            // Pin all new hashes that didn't exist previously
            for (const hash of newIpfsHashes) {
                if (hash && !ipfsHashes.includes(hash)) {
                    try {
                        let fileSizeKey = ipfsIndex[hash];
                        if (String(fileSizeKey).startsWith("db")) {
                            fileSizeKey = "db.doc.*";
                        } else if (String(fileSizeKey).startsWith("schema")) {
                            fileSizeKey = "schema.*";
                        }

                        // Only pin files that aren't databases
                        if (fileSizeKey !== "db") {
                            const res = await got.get(`${options.gateway}/api/v0/object/stat/${hash}`);
                            const stat = JSON.parse(res.body);

                            const maxFileSize = Managers.configManager.getMilestone().ipfs.maxFileSize[fileSizeKey];
                            if (stat && stat.CumulativeSize <= maxFileSize) {
                                await ipfs.pin.add(hash);
                                container.resolvePlugin<Logger.ILogger>("logger").info(`IPFS File added ${hash}`);
                            } else {
                                let error = "Unknown error.";
                                if (!stat) {
                                    error = "Can't resolve hash.";
                                } else if (stat.CumulativeSize > maxFileSize) {
                                    error = "Filesize too big.";
                                }
                                container
                                    .resolvePlugin<Logger.ILogger>("logger")
                                    .warn(`IPFS File ${hash} not added: ${error}`);
                            }
                        }
                    } catch (error) {
                        container.resolvePlugin<Logger.ILogger>("logger").error(error);
                    }
                    ipfsHashes.push(hash);
                }
            }

            // Unpin all ipfs hashes that no longer exist in new ipfs hashes
            for (const hash of ipfsHashes) {
                if (hash && !newIpfsHashes.includes(hash)) {
                    try {
                        await ipfs.pin.rm(hash);
                    } catch (e) {
                        // Throws error if file isn't pinned, probably because the file size was too big previously.
                    }
                    ipfsHashes.splice(ipfsHashes.indexOf(hash), 1);
                    container.resolvePlugin<Logger.ILogger>("logger").info(`IPFS File removed ${hash}`);
                }
            }
        };

        // Setup IPFS node after forger start
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

        // On a new round, update the hashes that should be pinned on the node by querying activeDelegates and checking their files.
        emitter.on("block.applied", async (blockData: Interfaces.IBlockData) => {
            const db = app.resolvePlugin<Database.IDatabaseService>("database");
            const isNewRound = roundCalculator.isNewRound(blockData.height);
            // Only load new hashes if new round, or each block when running testnet.
            if (
                ipfs &&
                (isNewRound ||
                    ["realtestnet", "testnet", "nospluginnet"].includes(Managers.configManager.get("network.name")))
            ) {
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
