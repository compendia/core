import { Container, Logger } from "../../../packages/core-interfaces";
import { Handlers } from "../../../packages/core-transactions";
import { defaults } from "./defaults";
import { StakeRegistrationTransactionHandler } from "./handlers";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-registration-transaction",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering custom transactions");
        Handlers.Registry.registerCustomTransactionHandler(StakeRegistrationTransactionHandler);
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering custom transactions");
        Handlers.Registry.deregisterCustomTransactionHandler(StakeRegistrationTransactionHandler);
    },
};
