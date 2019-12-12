import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
// import { roundCalculator } from '@arkecosystem/core-utils';
import { Interfaces } from "@arkecosystem/crypto";
import IPFS from "ipfs";
import path from "path";

import { defaults } from "./defaults";
import { DposIpfsTransactionHandler } from "./handlers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
const db = app.resolvePlugin<Database.IDatabaseService>("database");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "dpos-ipfs",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Module IPFS Transaction");
        Handlers.Registry.registerTransactionHandler(DposIpfsTransactionHandler);
        const ipfsHashes = [];
        let ipfs;
        const loadIpfsHashes = async (delegates: State.IWallet[]) => {
            const newIpfsHashes = [];
            for (const delegate of delegates) {
                if (delegate.hasAttribute("dpos.ipfs")) {
                    const dIpfs = delegate.getAttribute("dpos.ipfs");
                    const delegateIpfs = Object.values(dIpfs);
                    // Get all ipfs hashes from all delegates and store it in newIpfsHashes[]
                    for (const hash of delegateIpfs) {
                        console.log(hash);
                        newIpfsHashes.push(hash);
                    }
                }
            }

            // Pin all new hashes that didn't exist previously
            for (const hash of newIpfsHashes) {
                if (hash && ipfsHashes.indexOf(hash) < 0) {
                    await ipfs.pin.add(hash);
                    ipfsHashes.push(hash);
                }
            }

            // Unpin all ipfs hashes that no longer exist in new ipfs hashes
            for (const hash of ipfsHashes) {
                if (hash && newIpfsHashes.indexOf(hash) < 0) {
                    await ipfs.pin.rm(hash);
                    delete ipfsHashes[ipfsHashes.indexOf(hash)];
                }
            }
        };

        // Setup IPFS node ApplicationEvents.ForgerStarted
        emitter.on(ApplicationEvents.ForgerStarted, async forger => {
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
            });

            // Load hashes
            await loadIpfsHashes(delegates);
        });

        // emitter.on("dpos.ipfs.updated", async (data) => {
        //     if(ipfsHashes.indexOf(data.new) > 0){

        //     }
        //     await ipfs.pin.add(data.new);
        //     await ipfs.pin.rm(data.old);
        // })

        emitter.on("block.applied", async (blockData: Interfaces.IBlockData) => {
            // const isNewRound = roundCalculator.isNewRound(blockData.height);
            // if (isNewRound) {
            const delegates = await db.getActiveDelegates();
            const delegateWallets = [];
            for (const delegate of delegates) {
                const dWallet = db.walletManager.findByPublicKey(delegate.publicKey);
                delegateWallets.push(dWallet);
            }
            await loadIpfsHashes(delegateWallets);
            // }
        });
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering DPOS IPFS Transaction");
        Handlers.Registry.deregisterTransactionHandler(DposIpfsTransactionHandler);
    },
};

export { DposIpfsTransactionHandler };
