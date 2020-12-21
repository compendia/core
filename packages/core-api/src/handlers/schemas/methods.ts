import { app } from "@arkecosystem/core-container";
import { Database } from "@arkecosystem/core-interfaces";
import Boom from "@hapi/boom";
import { ServerCache } from "../../services";
import { paginate, respondWithResource, toPagination } from "../utils";

const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");

const index = async request => {
    const schemas = databaseService.wallets.search(Database.SearchScope.Schemas, {
        ...request.query,
        ...paginate(request),
    });

    return toPagination(schemas, "schema");
};

const show = async request => {
    const schema = databaseService.wallets.search(Database.SearchScope.Schemas, {
        id: request.params.id,
    }).rows[0];

    if (!schema) {
        return Boom.notFound("Schema not found");
    }

    return respondWithResource(schema, "schema");
};

const search = async request => {
    const schemas = databaseService.wallets.search(Database.SearchScope.Schemas, {
        ...request.payload,
        ...request.query,
        ...paginate(request),
    });

    return toPagination(schemas, "schema");
};

export const registerMethods = server => {
    ServerCache.make(server)
        .method("v2.schemas.index", index, 8, request => ({
            ...request.query,
            ...paginate(request),
        }))
        .method("v2.schemas.show", show, 8, request => ({ id: request.params.id }))
        .method("v2.schemas.search", search, 30, request => ({
            ...request.payload,
            ...request.query,
            ...paginate(request),
        }));
};
