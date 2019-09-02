import { app } from "@arkecosystem/core-container";
import { Container, Logger } from "@arkecosystem/core-interfaces";
import { defaults } from "./defaults";

// TypeORM imports
import "reflect-metadata";
import { createConnection, getConnection } from "typeorm";

// Entities
import { Stake, Statistic } from "./entities";

// Core plugins
const logger = app.resolvePlugin<Logger.ILogger>("logger");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "storage",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Storage Plug-in.`);
        await createConnection({
            type: "sqlite",
            database: "./storage.sql",
            // Import entities to connection
            entities: [Stake, Statistic],
            synchronize: true,
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Storage Plug-in.`);
        await getConnection().close();
    },
};
