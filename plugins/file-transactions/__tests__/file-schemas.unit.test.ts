/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import { Handlers } from "@arkecosystem/core-transactions";
import { Managers } from "@arkecosystem/crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { SetFileTransactionHandler } from "../src/handlers";

const ajv = new Ajv();
// @ts-ignore
addFormats(ajv);

beforeAll(async () => {
    Managers.configManager.setFromPreset("nospluginnet");
    Managers.configManager.setHeight(48);
    Handlers.Registry.registerTransactionHandler(SetFileTransactionHandler);
});

describe("AJV Validation", () => {
    it("should throw if compiling invalid JSON schema", async () => {
        const jsonSchema = {
            invalidSchemaType: "object",
            properties: {
                name: { type: "string", minLength: 1, maxLength: 64 },
                email: { type: "string", format: "email" },
            },
            required: ["name"],
            additionalProperties: false,
        };

        const jsonString = JSON.stringify(jsonSchema);

        const jsonParsed = JSON.parse(jsonString);

        try {
            ajv.compile(jsonParsed);
            fail("should have failed");
        } catch (error) {
            expect(error).toBeTruthy();
        }
    });

    it("should pass if compiling valid JSON schema", async () => {
        const jsonSchema = {
            type: "object",
            properties: {
                name: { type: "string", minLength: 1, maxLength: 64 },
                email: { type: "string", format: "email" },
            },
            required: ["name"],
            additionalProperties: false,
        };

        const jsonString = JSON.stringify(jsonSchema);

        const jsonParsed = JSON.parse(jsonString);

        try {
            ajv.compile(jsonParsed);
        } catch (error) {
            fail("should have passed");
        }
    });

    it("should skip objects that dont pass validation", async () => {
        const jsonSchema = {
            type: "object",
            properties: {
                name: { type: "string", minLength: 1, maxLength: 64 },
                email: { type: "string", format: "email" },
            },
            required: ["name"],
            additionalProperties: false,
        };

        const jsonString = JSON.stringify(jsonSchema);

        const jsonParsed = JSON.parse(jsonString);

        try {
            const validate = ajv.compile(jsonParsed);
            const data = [
                {
                    name: "Dean",
                    email: "some@email.com",
                },
                {
                    name: "Maurice",
                    email: "some@email.com",
                },
                {
                    name: "Bob",
                    email: "incorrect",
                },
                {
                    age: 20,
                },
            ];

            const sanitizedData = [];
            for (const row of data) {
                const valid = validate(row);
                if (valid) {
                    sanitizedData.push(row);
                }
            }

            expect(sanitizedData).toEqual([
                {
                    name: "Dean",
                    email: "some@email.com",
                },
                {
                    name: "Maurice",
                    email: "some@email.com",
                },
            ]);
        } catch (error) {
            fail(error);
        }
    });
});
