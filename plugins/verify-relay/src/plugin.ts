import { Container } from "@arkecosystem/core-interfaces";
import { Server } from "./server";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    alias: "verify-relay",
    async register(container: Container.IContainer, options) {
        const server: Server = new Server();
        server.start();
        return server;
    }
};
