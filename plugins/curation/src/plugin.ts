import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Identities } from "@arkecosystem/crypto";
import { Builders as CuratorBuilders } from "@nosplatform/curation-crypto";
import got from "got";
import IPFS from "ipfs";
import path from "path";
import publicIp from "public-ip";

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

        const secrets = app.getConfig().get("delegates.secrets");
        if (secrets) {
            const secret = secrets[0];
            const publicKey = Identities.PublicKey.fromPassphrase(secret);
            const ipfsHashes = {};
            let ipfs;
            // Setup IPFS node ApplicationEvents.ForgerStarted
            emitter.on(ApplicationEvents.ForgerStarted, async block => {
                const db = app.resolvePlugin<Database.IDatabaseService>("database");
                const delegates = await db.getActiveDelegates();
                const wallet: State.IWallet = db.walletManager.findByPublicKey(publicKey);

                /*
                 *  Node Address Update
                 */
                if (delegates.find(delegate => delegate.publicKey === wallet.publicKey)) {
                    const nodeAddr = wallet.getAttribute("curator.node");
                    const ip = await publicIp.v4();
                    const currentNodeAddr = `/ip4/${ip}/tcp/6002`;
                    if (nodeAddr !== currentNodeAddr) {
                        const builder = new CuratorBuilders.SetIpfsNodeBuilder();
                        const nodeTx = builder
                            .network(app.getConfig().get("network.pubKeyHash"))
                            .nonce(wallet.nonce.plus(1).toString())
                            .fee("0")
                            .nodeAsset(currentNodeAddr)
                            .sign(secret)
                            .getStruct();
                        try {
                            const txResult = await got.post(
                                `http://localhost:${process.env.CORE_API_PORT}/api/v2/transactions`,
                                {
                                    json: true,
                                    body: { transactions: [nodeTx] },
                                },
                            );
                            const json = JSON.parse(txResult.body);
                            if (txResult.statusCode === 200 && Object.keys(json.data.accept).length) {
                                container
                                    .resolvePlugin<Logger.ILogger>("logger")
                                    .info(`Transaction success: ${nodeTx.id}`);
                            } else {
                                container.resolvePlugin<Logger.ILogger>("logger").error(`Transaction posting error`);
                                container.resolvePlugin<Logger.ILogger>("logger").error(json);
                            }
                        } catch (error) {
                            container.resolvePlugin<Logger.ILogger>("logger").error(error);
                        }
                    }
                }

                /*
                 * IPFS configuration & init
                 */

                // Set node config
                const nodes = ["/ip4/0.0.0.0/tcp/6002", "/ip4/127.0.0.1/tcp/6003/ws"];
                for (const delegate of delegates) {
                    if (delegate.hasAttribute("curator.node")) {
                        const node = delegate.getAttribute("curator.node");
                        nodes[delegate.publicKey] = node;
                    }
                    if (delegate.hasAttribute("curator.ipfs")) {
                        const hash = delegate.getAttribute("curator.ipfs");
                        ipfsHashes[delegate.publicKey] = hash;
                    }
                }

                const ipfsPath = path.resolve(__dirname, `../.ipfs`);
                // Start IPFS node
                ipfs = await IPFS.create({
                    repo: ipfsPath,
                    // config: {
                    //     Addresses: {
                    //         Swarm: nodes,
                    //     },
                    // },
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

            // emitter.on("block.applied", async block => {
            //     console.log("hi");
            // });
        }
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering IPFS Node Transaction");
        Handlers.Registry.deregisterTransactionHandler(SetIpfsNodeTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Curate Transaction");
        Handlers.Registry.deregisterTransactionHandler(CurateTransactionHandler);
    },
};

export { CurateTransactionHandler, SetIpfsNodeTransactionHandler };
