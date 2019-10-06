import { app } from "@arkecosystem/core-container";
import { Container, Logger } from "@arkecosystem/core-interfaces";
import { Managers } from "@nosplatform/crypto";
import * as path from "path";
// TypeORM imports
import "reflect-metadata";
import { createConnection, getConnection } from "typeorm";
import { defaults } from "./defaults";
import { startServer } from "./server";

// Queue
import queue from "queue";
const qp = queue();
qp.concurrency = 1;

// Entities
import { Round, Stake, Statistic } from "./entities";

// Core plugins
const logger = app.resolvePlugin<Logger.ILogger>("logger");
const network = Managers.configManager.get("network");
const dbPath = path.resolve(__dirname, `../../storage/databases/${network.name}.sqlite`);

// Queue job plug-in, all functions that write to db should be wrapped in this.
qp.autostart = true;
export const q = async fn => {
    qp.push(fn);
};

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "storage",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Storage Plug-in.`);
        logger.info(`Storage Plug-in Database Path: ${dbPath}`);

        let connection = await createConnection({
            type: "postgres",
            host: process.env.CORE_DB_HOST,
            port: Number(process.env.CORE_DB_PORT),
            username: process.env.CORE_DB_USERNAME,
            password: process.env.CORE_DB_PASSWORD,
            database: process.env.CORE_DB_DATABASE,
        });

        await connection.query('CREATE SCHEMA IF NOT EXISTS "plugin"');
        await connection.close();

        connection = await createConnection({
            type: "postgres",
            host: process.env.CORE_DB_HOST,
            port: Number(process.env.CORE_DB_PORT),
            username: process.env.CORE_DB_USERNAME,
            password: process.env.CORE_DB_PASSWORD,
            database: process.env.CORE_DB_DATABASE,
            synchronize: true,
            schema: "plugin",
            // Import entities to connection
            entities: [Stake, Statistic, Round],
        });

        startServer({ host: "0.0.0.0", port: 8000 });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Storage Plug-in.`);
        await getConnection().close();
    },
};
