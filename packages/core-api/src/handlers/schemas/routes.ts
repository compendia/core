import Hapi from "@hapi/hapi";
import { SchemaController } from "./controller";
import * as Schema from "./schema";

export const registerRoutes = (server: Hapi.Server): void => {
    const controller = new SchemaController();
    server.bind(controller);

    server.route({
        method: "GET",
        path: "/schemas",
        handler: controller.index,
        options: {
            validate: Schema.index,
        },
    });

    server.route({
        method: "GET",
        path: "/schemas/{id}",
        handler: controller.show,
        options: {
            validate: Schema.show,
        },
    });

    server.route({
        method: "POST",
        path: "/schemas/search",
        handler: controller.search,
        options: {
            validate: Schema.search,
        },
    });
};
