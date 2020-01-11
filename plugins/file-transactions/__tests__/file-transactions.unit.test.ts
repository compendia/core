/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Identities, Managers, Utils } from "@arkecosystem/crypto";
import { TransactionSchemaError } from "@arkecosystem/crypto/dist/errors";

import { WalletManager } from "../../../packages/core-state/src/wallets";
import { Builders as FileTransactionBuilders } from "../../file-transactions-crypto/src";
import { SetFileTransactionHandler } from "../src/handlers";

// import {
//     DatabaseConnectionStub
// } from '../../../__tests__/unit/core-database/__fixtures__/database-connection-stub';
// import { ExpireHelper } from '../src/helpers';

const secret = "clay harbor enemy utility margin pretty hub comic piece aerobic umbrella acquire";

beforeAll(async () => {
    Managers.configManager.setFromPreset("testnet");
    Managers.configManager.setHeight(1);
    Handlers.Registry.registerTransactionHandler(SetFileTransactionHandler);
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter;
let walletManager: State.IWalletManager;
let setFileHandler;

beforeEach(() => {
    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase(secret);
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter.balance = stakeAmount.times(10);
    setFileHandler = new SetFileTransactionHandler();

    jest.spyOn(voter, "isDelegate").mockReturnValue(true);
});

describe("File Transactions", () => {
    it("should throw if posting unrecognized ipfs key", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("xxx", "Qmb7yMk2w5BUyFB3PjMcFqkLQg45Be7M8ohWB1UbAoeuDo")
            .nonce(voter.nonce.plus(1))
            .sign(secret);

        expect(() => ipfsTransaction.build()).toThrowError(TransactionSchemaError);
    });

    it("should pass if posting recognized ipfs key", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("description", "Qmb7yMk2w5BUyFB3PjMcFqkLQg45Be7M8ohWB1UbAoeuDo")
            .nonce(voter.nonce.plus(1))
            .fee("0")
            .sign(secret);

        try {
            ipfsTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
        } catch (error) {
            fail(error);
        }

        try {
            await walletManager.applyTransaction(ipfsTransaction.build());
        } catch (error) {
            fail(error);
        }
    });

    it("should pass if posting db.apps", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("db.apps", "Qmb7yMk2w5BUyFB3PjMcFqkLQg45Be7M8ohWB1UbAoeuDo")
            .nonce(voter.nonce.plus(1))
            .fee("0")
            .sign(secret);

        try {
            ipfsTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
        } catch (error) {
            fail(error);
        }

        try {
            await walletManager.applyTransaction(ipfsTransaction.build());
        } catch (error) {
            fail(error);
        }
    });
});
