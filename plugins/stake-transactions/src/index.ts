import { Container, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { defaults } from "./defaults";
import { StakeCancelHandler, StakeClaimHandler, StakeCreateTransactionHandler } from "./handlers";
import * as StakeHelpers from "./helpers";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering custom transactions");
        Handlers.Registry.registerCustomTransactionHandler(StakeCreateTransactionHandler);
        Handlers.Registry.registerCustomTransactionHandler(StakeCancelHandler);
        Handlers.Registry.registerCustomTransactionHandler(StakeClaimHandler);
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering custom transactions");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeCreateTransactionHandler);
        Handlers.Registry.deregisterCustomTransactionHandler(StakeCancelHandler);
        Handlers.Registry.deregisterCustomTransactionHandler(StakeClaimHandler);
    },
};

export { StakeHelpers };
