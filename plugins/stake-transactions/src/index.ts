import { Container, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { defaults } from "./defaults";
import { StakeCancelTransactionHandler, StakeClaimTransactionHandler, StakeCreateTransactionHandler } from "./handlers";
import * as StakeHelpers from "./helpers";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Create Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Cancel Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeCancelTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Claim Transaction");
        Handlers.Registry.registerCustomTransactionHandler(StakeClaimTransactionHandler);
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Create Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Cancel Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeCancelTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Claim Transaction");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeClaimTransactionHandler);
    },
};

export { StakeHelpers, StakeCreateTransactionHandler, StakeCancelTransactionHandler, StakeClaimTransactionHandler };
