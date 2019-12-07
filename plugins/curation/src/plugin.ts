import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import * as fs from "fs";
import IPFS from "ipfs";
import * as path from "path";

import { defaults } from "./defaults";
import { CurateTransactionHandler, SetIpfsNodeTransactionHandler } from "./handlers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "curation",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering IPFS Node Transaction");
        Handlers.Registry.registerTransactionHandler(SetIpfsNodeTransactionHandler);

        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Curate Transaction");
        Handlers.Registry.registerTransactionHandler(CurateTransactionHandler);

        // Setup IPFS node ApplicationEvents.ForgerStarted
        emitter.on(ApplicationEvents.ForgerStarted, async block => {
            const db = app.resolvePlugin<Database.IDatabaseService>("database");
            const delegates = await db.getActiveDelegates();
            const nodes = ["/ip4/0.0.0.0/tcp/6002", "/ip4/127.0.0.1/tcp/6003/ws"];
            const ipfsHashes = {};
            for (const delegate of delegates) {
                if (delegate.hasAttribute("curator.node")) {
                    const node = delegate.getAttribute("curator.node");
                    nodes[delegate.publicKey] = node;
                }
                if (delegate.hasAttribute("curator.ipfs")) {
                    const hash = delegate.getAttribute("curator.ipfs");
                    ipfsHashes[delegate.publicKey] = hash;
                    await IPFS.pin.add(hash);
                }
            }

            const ipfs = await IPFS.create({
                config: {
                    Bootstrap: [],
                    Addresses: {
                        Swarm: nodes,
                    },
                },
            });
            const curatorPath = path.resolve(__dirname, `../ipfs/curation.sqlite`);

            if (fs.existsSync(curatorPath)) {
                const myFile = await ipfs.addFromFs(curatorPath);
                console.log(myFile);
                const list = await ipfs.pin.ls();
                console.log(list);
            }

            console.log(await ipfs.bootstrap.list());
        });

        emitter.on("block.applied", async block => {
            console.log("hi");
        });
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering IPFS Node Transaction");
        Handlers.Registry.deregisterTransactionHandler(SetIpfsNodeTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Curate Transaction");
        Handlers.Registry.deregisterTransactionHandler(CurateTransactionHandler);
    },
};

export { CurateTransactionHandler, SetIpfsNodeTransactionHandler };
