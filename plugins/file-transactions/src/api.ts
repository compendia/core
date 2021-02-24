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

    // Get databases by schema
    server.route({
        method: "GET",
        path: "/api/v1/databases/{schema}",
        async handler(request, h) {
            const schema: string = String(request.params.schema);
            const virtualPage = Number(request.params.page) || 1;
            const page = virtualPage - 1;
            const databases: any = database
                .prepare(`SELECT * FROM databases WHERE schema = :schema LIMIT 100 OFFSET ${page * 100}`)
                .all({ schema });
            const allDbs: any = database
                .prepare(`SELECT COUNT(*) FROM databases WHERE schema = :schema`)
                .get({ schema });

            if (databases.length) {
                const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
                const walletManager = databaseService.walletManager;
                for (const db of databases) {
                    const wallet = walletManager.findByAddress(db.owner_address);
                    databases[databases.indexOf(db)].owner = {
                        username: db.owner_username,
                        address: db.owner_address,
                        votes: wallet.getAttribute("delegate.voteBalance", "0"),
                    };
                    databases[databases.indexOf(db)].owner_address = undefined;
                    databases[databases.indexOf(db)].owner_username = undefined;
                }

                const results = databases.sort((a, b) =>
                    Utils.BigNumber.make(a.voteBalance || 0).isGreaterThan(b.voteBalance || 0) ? -1 : 1,
                );

                return {
                    results,
                    totalCount: allDbs["COUNT(*)"],
                    meta: { count: databases.length, limit: 100, page: virtualPage },
                };
            } else {
                return notFound();
            }
        },
    });

    // Get database by id
    server.route({
        method: "GET",
        path: "/api/v1/database/{id}",
        async handler(request, h) {
            const id: string = String(request.params.id);
            const db: any = database.prepare(`SELECT * FROM databases WHERE id = :id LIMIT 1`).get({ id });

            if (Object.values(db).length) {
                const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
                const walletManager = databaseService.walletManager;
                const wallet = walletManager.findByAddress(db.owner_address);
                db.owner = {
                    username: db.owner_username,
                    address: db.owner_address,
                    votes: wallet.getAttribute("delegate.voteBalance", "0"),
                };
                db.owner_address = undefined;
                db.owner_username = undefined;
                return {
                    data: db,
                };
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
            const page = (Number(request.params.page) || 1) - 1;
            const databases: any = database
                .prepare(`SELECT * FROM databases WHERE schema LIKE ? LIMIT 100 OFFSET ${page * 100}`)
                .all("%" + schema + "%");
            if (databases.length) {
                const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
                const walletManager = databaseService.walletManager;
                for (const db of databases) {
                    const wallet = walletManager.findByAddress(db.owner_address);
                    databases[databases.indexOf(db)].votes = wallet.getAttribute("delegate.voteBalance", 0);
                }

                const results = databases.sort((a, b) =>
                    Utils.BigNumber.make(a.voteBalance || 0).isGreaterThan(b.voteBalance || 0) ? -1 : 1,
                );

                return { results, totalCount: databases.length, meta: { count: databases.length, limit: 100, page } };
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
