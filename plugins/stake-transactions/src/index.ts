import { Container, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { defaults } from "./defaults";
import { StakeCreateTransactionHandler, StakeRedeemTransactionHandler } from "./handlers";
import * as StakeHelpers from "./helpers";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Create Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Redeem Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeRedeemTransactionHandler);
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Create Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Redeem Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeRedeemTransactionHandler);
    },
};

export { StakeHelpers, StakeCreateTransactionHandler, StakeRedeemTransactionHandler };
