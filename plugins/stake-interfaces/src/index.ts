import { Container, Logger } from "@arkecosystem/core-interfaces";
import { defaults } from "./defaults";
import * as StakeInterfaces from "./interfaces";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "stake-transactions",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Registering custom interfaces");
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering custom interfaces");
    },
};

export { StakeInterfaces };
