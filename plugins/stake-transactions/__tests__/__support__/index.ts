import "jest-extended";

import { Container, Database, State } from "@arkecosystem/core-interfaces";
import { Wallets } from "@arkecosystem/core-state";
import { Crypto, Identities, Managers, Utils } from "@arkecosystem/crypto";
import { database, initDb } from "@nosplatform/stake-transactions";
import delay from "delay";
import * as fs from "fs";
import cloneDeep from "lodash.clonedeep";
import * as path from "path";
import { secrets } from "../../../../__tests__/utils/config/nospluginnet/delegates.json";
import { setUpContainer } from "../../../../__tests__/utils/helpers/container";

jest.setTimeout(1200000);

let app: Container.IContainer;
export const setUp = async (): Promise<void> => {
    try {
        process.env.CORE_RESET_DATABASE = "1";
        const dbPath = path.resolve(__dirname, `../../../storage/databases/nospluginnet.sqlite`);
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        database.exec(`
        DROP TABLE IF EXISTS stakes
    `);
        initDb();

        app = await setUpContainer({
            include: [
                "@arkecosystem/core-container",
                "@arkecosystem/core-event-emitter",
                "@arkecosystem/core-logger-pino",
                "@arkecosystem/core-state",
                "@arkecosystem/core-database-postgres",
                "@arkecosystem/core-transaction-pool",
                "@arkecosystem/core-p2p",
                "@arkecosystem/core-blockchain",
                "@arkecosystem/core-api",
                "@nosplatform/storage",
                "@nosplatform/stake-transactions",
                "@arkecosystem/core-forger",
                "@nosplatform/supply-tracker",
            ],
            network: "nospluginnet",
        });

        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        await databaseService.reset();
        await databaseService.buildWallets();
        await databaseService.saveRound(
            secrets.map(secret =>
                Object.assign(new Wallets.Wallet(Identities.Address.fromPassphrase(secret)), {
                    publicKey: Identities.PublicKey.fromPassphrase(secret),
                    attributes: {
                        delegate: {
                            voteBalance: Utils.BigNumber.make("245098000000000"),
                            round: 1,
                        },
                    },
                }),
            ),
        );
        await (databaseService as any).initializeActiveDelegates(1);
    } catch (error) {
        console.error(error.stack);
    }
};

export const tearDown = async (): Promise<void> => {
    const dbPath = path.resolve(__dirname, `../../../storage/databases/nospluginnet.sqlite`);
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
    await databaseService.reset();
    database.exec(`
    DROP TABLE IF EXISTS stakes
`);
};

export const snoozeForBlock = async (sleep: number = 0, height: number = 1): Promise<void> => {
    const blockTime = Managers.configManager.getMilestone(height).blocktime * 1000;
    const remainingTimeInSlot = Crypto.Slots.getTimeInMsUntilNextSlot();
    const sleepTime = sleep * 1000;

    return delay(blockTime + remainingTimeInSlot + sleepTime);
};

export const injectMilestone = (index: number, milestone: Record<string, any>): void => {
    (Managers.configManager as any).milestones.splice(
        index,
        0,
        Object.assign(cloneDeep(Managers.configManager.getMilestone()), milestone),
    );
};

export const getLastHeight = (): number => {
    return app
        .resolvePlugin<State.IStateService>("state")
        .getStore()
        .getLastHeight();
};

export const getSenderNonce = (senderPublicKey: string): Utils.BigNumber => {
    return app.resolvePlugin<Database.IDatabaseService>("database").walletManager.getNonce(senderPublicKey);
};

export const passphrases = {
    passphrase: "this is top secret passphrase number 1",
    secondPassphrase: "this is top secret passphrase number 2",
};
