import { createServer, mountServer } from "@arkecosystem/core-http-utils";
import { Utils } from "@arkecosystem/crypto";
import { notFound } from "@hapi/boom";
import { Round, Statistic } from "./entities";

export const startServer = async config => {
    const server = await createServer({
        host: config.host,
        port: config.port,
    });

    // Round Data
    server.route({
        method: "GET",
        path: "/round/{id}",
        async handler(request, h) {
            const id: number = Utils.BigNumber.make(request.params.id).toNumber();
            const round = await Round.findOne({ id });
            const response: any = round;
            if (round) {
                response.topDelegates = round.topDelegates.split(",");
                return response;
            } else {
                return notFound();
            }
        },
    });

    // Statistics
    server.route({
        method: "GET",
        path: "/stat/{name}",
        async handler(request, h) {
            const stats = await Statistic.findOne({ name: request.params.name });
            if (stats) {
                return stats.value;
            } else {
                return notFound();
            }
        },
    });

    return mountServer("nOS Storage Server", server);
};
