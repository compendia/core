import { app } from "@arkecosystem/core-container";
import { createServer, mountServer } from "@arkecosystem/core-http-utils";
import { Database } from "@arkecosystem/core-interfaces";
import { Utils } from "@arkecosystem/crypto";
import { notFound } from "@hapi/boom";
import { database } from "./database";

export const startServer = async config => {
    const server = await createServer({
        host: config.host,
        port: config.port,
        routes: {
            cors: config.cors,
        },
    });

    // Get database by schema
    server.route({
        method: "GET",
        path: "/api/v1/databases/{schema}",
        async handler(request, h) {
            const schema: string = String(request.params.schema);
            const databases: any = database.prepare(`SELECT * FROM databases WHERE schema = :schema`).all({ schema });
            if (databases.length) {
                const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
                const walletManager = databaseService.walletManager;
                for (const db of databases) {
                    const wallet = walletManager.findByAddress(db.owner_address);
                    databases[databases.indexOf(db)].votes = wallet.getAttribute("delegate.voteBalance", 0);
                }

                const results = databases.sort((a, b) =>
                    Utils.BigNumber.make(a.voteBalance).isGreaterThan(b.voteBalance) ? -1 : 1,
                );

                return { meta: { totalCount: databases.length }, data: results };
            } else {
                return notFound();
            }
        },
    });

    // Search databases by schema ("LIKE")
    server.route({
        method: "GET",
        path: "/api/v1/databases/search/{schema}",
        async handler(request, h) {
            const schema: string = String(request.params.schema);
            const databases: any = database
                .prepare(`SELECT * FROM databases WHERE schema LIKE ?`)
                .all("%" + schema + "%");
            if (databases.length) {
                const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
                const walletManager = databaseService.walletManager;
                for (const db of databases) {
                    const wallet = walletManager.findByAddress(db.owner_address);
                    databases[databases.indexOf(db)].votes = wallet.getAttribute("delegate.voteBalance", 0);
                }

                const results = databases.sort((a, b) =>
                    Utils.BigNumber.make(a.voteBalance).isGreaterThan(b.voteBalance) ? -1 : 1,
                );

                return { meta: { totalCount: databases.length }, data: results };
            } else {
                return notFound();
            }
        },
    });

    // // Statistics
    // server.route({
    //   method: "GET",
    //   path: "/api/v1/databases",
    //   async handler(request, h) {
    //     const stats = await Statistic.findOne({ name: request.params.name });
    //     if (stats) {
    //       return stats.value;
    //     } else {
    //       return notFound();
    //     }
    //   },
    // });

    return mountServer("Compendia Database API", server);
};
