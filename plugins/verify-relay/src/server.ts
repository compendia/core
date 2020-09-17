import { app } from "@arkecosystem/core-container";
import { Database, Logger, State } from "@arkecosystem/core-interfaces";
import { Crypto, Identities } from "@arkecosystem/crypto";

import boom from "@hapi/boom";
import { randomBytes } from "crypto";

export class Server {
    public start(): void {
        const logger: Logger.ILogger = app.resolvePlugin<Logger.ILogger>("logger");

        const api = app.resolvePlugin("api");

        if (!api) {
            logger.warn("Could not start relay verifier as the Public API is not loaded");
            return;
        }

        const http = api.instance("http");
        let passphrase: string;
        let key: string;

        const signWithPassphrase = request => {
            if (!passphrase || request.query.key !== key) {
                return boom.notFound();
            }

            return Crypto.Message.sign(Crypto.Slots.getTime().toString(), passphrase);
        };

        const deletePassphrase = request => {
            if (!passphrase || request.info.remoteAddress !== "127.0.0.1") {
                return boom.notFound();
            }

            passphrase = undefined;

            return {
                success: true
            };
        };

        const putPassphrase = request => {
            if (request.info.remoteAddress !== "127.0.0.1") {
                return boom.notFound();
            }

            const payloadPassphrase: string = Object.keys(request.payload)[0];
            if (!payloadPassphrase) {
                return boom.badData("No passphrase provided");
            }

            const databaseService: Database.IDatabaseService = app.resolvePlugin<
                Database.IDatabaseService
            >("database");
            const wallet: State.IWallet = databaseService.walletManager.findByPublicKey(
                Identities.PublicKey.fromPassphrase(payloadPassphrase)
            );

            if (wallet.hasAttribute("delegate")) {
                key = randomBytes(32).toString("hex");
                passphrase = payloadPassphrase;
                return {
                    delegate: wallet.getAttribute("delegate").username,
                    key
                };
            }

            return boom.notFound("Delegate not found with provided passphrase");
        };

        http.route({
            method: "GET",
            path: "/api/verify",
            handler: request => signWithPassphrase(request)
        });

        http.route({
            method: "PUT",
            path: "/api/verify",
            handler: request => putPassphrase(request)
        });

        http.route({
            method: "DELETE",
            path: "/api/verify",
            handler: request => deletePassphrase(request)
        });

        logger.info("Relay verifier started");
    }
}
