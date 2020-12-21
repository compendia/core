import Joi from "@hapi/joi";
import { schemaInteratees } from "../shared/iteratees";
import { orderBy, pagination } from "../shared/schemas";

export const index: object = {
    query: {
        ...pagination,
        ...{
            orderBy: orderBy(schemaInteratees),
            publicKey: Joi.string()
                .hex()
                .length(66),
            id: Joi.string()
                .regex(/^[a-zA-Z0-9_-]+$/)
                .max(64),
        },
    },
};

export const show: object = {
    params: Joi.object({
        id: Joi.string()
            .regex(/^[a-zA-Z0-9_-]+$/)
            .max(64),
    }),
};

export const search: object = {
    query: Joi.object({
        ...pagination,
        ...{
            orderBy: orderBy(schemaInteratees),
        },
    }),
    payload: Joi.object({
        publicKey: Joi.string()
            .hex()
            .length(66),
        id: Joi.string()
            .regex(/^[a-zA-Z0-9_-]+$/)
            .max(64),
    }),
};
