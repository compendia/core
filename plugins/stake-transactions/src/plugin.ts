import { Container, Logger } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { defaults } from "./defaults";
import { StakeCancelTransactionHandler } from "./handlers";
import { StakeCreateTransactionHandler } from "./handlers/stake-create";
import { StakeRedeemTransactionHandler } from "./handlers/stake-redeem";
import * as StakeHelpers from "./helpers";
import { initDb } from "./index";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-transactions",
    async register(container: Container.IContainer, options) {
        initDb();
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Create Transaction");
        Handlers.Registry.registerTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Cancel Transaction");
        Handlers.Registry.registerTransactionHandler(StakeCancelTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering Stake Redeem Transaction");
        Handlers.Registry.registerTransactionHandler(StakeRedeemTransactionHandler);
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Create Transaction");
        Handlers.Registry.deregisterTransactionHandler(StakeCreateTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Cancel Transaction");
        Handlers.Registry.deregisterTransactionHandler(StakeCancelTransactionHandler);
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Stake Redeem Transaction");
        Handlers.Registry.deregisterTransactionHandler(StakeRedeemTransactionHandler);
    },
};

export { StakeCreateTransactionHandler, StakeRedeemTransactionHandler, StakeHelpers };
