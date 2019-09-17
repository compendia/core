import { app } from "@arkecosystem/core-container";
import { Container, Logger } from "@arkecosystem/core-interfaces";
import { Managers } from "@arkecosystem/crypto";
import * as path from "path";
// TypeORM imports
import "reflect-metadata";
import { createConnection, getConnection } from "typeorm";
import { defaults } from "./defaults";
import { startServer } from "./server";

// Entities
import { Round, Stake, Statistic } from "./entities";

// Core plugins
const logger = app.resolvePlugin<Logger.ILogger>("logger");
const network = Managers.configManager.get("network");
const dbPath = path.resolve(__dirname, `../../storage/databases/${network.name}.sqlite`);

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "storage",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Storage Plug-in.`);
        logger.info(`Storage Plug-in Database Path: ${dbPath}`);
        await createConnection({
            type: "sqlite",
            database: dbPath,
            // Import entities to connection
            entities: [Stake, Statistic, Round],
            synchronize: true,
        });
        startServer({ host: "0.0.0.0", port: 8000 });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Storage Plug-in.`);
        await getConnection().close();
    },
};
