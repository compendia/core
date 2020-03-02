import { createServer, mountServer } from "@arkecosystem/core-http-utils";
import { notFound } from "@hapi/boom";
import { Round, Statistic } from "./entities";

export const startServer = async config => {
    const server = await createServer({
        host: config.host,
        port: config.port,
        routes: {
            cors: config.cors,
        },
    });

    // Round Data
    server.route({
        method: "GET",
        path: "/api/v1/round/{id}",
        async handler(request, h) {
            const id: number = Number(request.params.id);
            const round = await Round.findOne({ id });
            const response: any = round;
            if (round) {
                return response;
            } else {
                return notFound();
            }
        },
    });

    // Statistics
    server.route({
        method: "GET",
        path: "/api/v1/stat/{name}",
        async handler(request, h) {
            const stats = await Statistic.findOne({ name: request.params.name });
            if (stats) {
                return stats.value;
            } else {
                return notFound();
            }
        },
    });

    // Statistics
    server.route({
        method: "GET",
        path: "/api/v1/stats",
        async handler(request, h) {
            const stats = await Statistic.find();
            if (stats) {
                const statsJson = {};
                for (const stat of stats) {
                    if (String(stat.name).split(".").length > 1) {
                        const statArr = String(stat.name).split(".");
                        statsJson[statArr[0]] = {};
                        statsJson[statArr[0]][statArr[1]] = stat.value;
                    } else {
                        statsJson[stat.name] = stat.value;
                    }
                }
                return statsJson;
            } else {
                return notFound();
            }
        },
    });

    return mountServer("nOS Storage Server", server);
};
