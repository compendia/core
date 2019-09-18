import { app } from "@arkecosystem/core-container";
import { Container, Database, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { roundCalculator } from "@arkecosystem/core-utils";
import { defaults } from "./defaults";
import { StakeCreateTransactionHandler, StakeRedeemTransactionHandler } from "./handlers";
import * as StakeHelpers from "./helpers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Create Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Redeem Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeRedeemTransactionHandler);
        emitter.on("block.applied", async block => {
            const isNewRound = roundCalculator.isNewRound(block.height);
            if (isNewRound) {
                await StakeHelpers.ExpireHelper.processExpirations(databaseService.walletManager);
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Create Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Redeem Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeRedeemTransactionHandler);
    },
};

export { StakeHelpers, StakeCreateTransactionHandler, StakeRedeemTransactionHandler };
