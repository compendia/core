import { app } from "@arkecosystem/core-container";
import { Container, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Handlers } from "@nosplatform/core-transactions";
import { asValue } from "awilix";
import { defaults } from "./defaults";
import { StakeCreateTransactionHandler, StakeRedeemTransactionHandler } from "./handlers";
import * as StakeHelpers from "./helpers";

const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

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
            const interval = setInterval(async () => {
                if (app.has("storage.processing") && !app.resolve("storage.processing")) {
                    app.register("storage.processing", asValue(true));
                    const isNewRound = roundCalculator.isNewRound(block.height);
                    if (isNewRound) {
                        await StakeHelpers.ExpireHelper.processExpirations();
                    }
                    app.register("storage.processing", asValue(false));
                    clearInterval(interval);
                }
            }, 50);
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
