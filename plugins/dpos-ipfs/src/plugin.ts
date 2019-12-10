import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import IPFS from "ipfs";
import path from "path";

import { defaults } from "./defaults";
import { DposIpfsTransactionHandler } from "./handlers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "dpos-ipfs",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Module IPFS Transaction");
        Handlers.Registry.registerTransactionHandler(DposIpfsTransactionHandler);

        const ipfsHashes = {};
        let ipfs;
        // Setup IPFS node ApplicationEvents.ForgerStarted
        emitter.on(ApplicationEvents.ForgerStarted, async block => {
            const db = app.resolvePlugin<Database.IDatabaseService>("database");
            const delegates = await db.getActiveDelegates();

            /*
             * IPFS configuration & init
             */

            // Set node config
            for (const delegate of delegates) {
                if (delegate.hasAttribute("dpos.ipfs")) {
                    const hash = delegate.getAttribute("dpos.ipfs");
                    ipfsHashes[delegate.publicKey] = hash;
                }
            }

            const ipfsPath = path.resolve(__dirname, `../.ipfs`);

            // Start IPFS node
            ipfs = await IPFS.create({
                repo: ipfsPath,
            });

            // Pin IPFS hashes
            for (const hash of Object.values(ipfsHashes)) {
                await ipfs.pin.add(hash);
            }
        });

        emitter.on("curator.ipfs.updated", async tx => {
            container.resolvePlugin<Logger.ILogger>("logger").info(`Pinning ${tx.asset.ipfs}`);
            console.log(ipfsHashes[tx.senderPublicKey]);
            if (ipfsHashes[tx.senderPublicKey] !== undefined) {
                const rm = await ipfs.pin.rm(ipfsHashes[tx.senderPublicKey]);
                container
                    .resolvePlugin<Logger.ILogger>("logger")
                    .info(`Removed pin from previous hash: ${tx.asset.ipfs}`);
                console.log(rm);
            }
            const pin = await ipfs.pin.add(tx.asset.ipfs);
            container.resolvePlugin<Logger.ILogger>("logger").info(`Added pin of hash: ${tx.asset.ipfs}`);
            console.log(pin);
            container.resolvePlugin<Logger.ILogger>("logger").info(`List of pins:`);
            console.log(await ipfs.pin.ls());
            ipfsHashes[tx.senderPublicKey] = tx.asset.ipfs;
            container.resolvePlugin<Logger.ILogger>("logger").info(`List of stored pins:`);
            console.log(ipfsHashes);
        });
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering DPOS IPFS Transaction");
        Handlers.Registry.deregisterTransactionHandler(DposIpfsTransactionHandler);
    },
};

export { DposIpfsTransactionHandler };
