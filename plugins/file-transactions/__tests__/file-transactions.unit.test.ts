/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Identities, Managers, Utils } from "@arkecosystem/crypto";
import { WalletManager } from "../../../packages/core-state/src/wallets";
import { Builders as FileTransactionBuilders } from "../../file-transactions-crypto/src";
import { FileKeyInvalid, InvalidMultiHash, SchemaAlreadyExists, SchemaNotFound } from "../src/errors";
import { SetFileTransactionHandler } from "../src/handlers";
import { FileIndex, schemaIndexer } from "../src/wallet-manager";

// import {
//     DatabaseConnectionStub
// } from '../../../__tests__/unit/core-database/__fixtures__/database-connection-stub';
// import { ExpireHelper } from '../src/helpers';

const secret = "clay harbor enemy utility margin pretty hub comic piece aerobic umbrella acquire";
const secret2 = "new harbor enemy utility margin pretty hub comic piece aerobic umbrella acquire";

beforeAll(async () => {
    Managers.configManager.setFromPreset("nospluginnet");
    Managers.configManager.setHeight(48);
    Handlers.Registry.registerTransactionHandler(SetFileTransactionHandler);
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter2Keys;
let voter;
let voter2;
let walletManager: State.IWalletManager;
let setFileHandler;

beforeEach(() => {
    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase(secret);
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter2Keys = Identities.Keys.fromPassphrase(secret2);
    voter2 = walletManager.findByPublicKey(voter2Keys.publicKey);
    voter.balance = stakeAmount.times(10);
    voter2.balance = stakeAmount.times(10);
    setFileHandler = new SetFileTransactionHandler();

    walletManager.registerIndex(FileIndex.Schemas, schemaIndexer);

    walletManager.reindex(voter);
    walletManager.reindex(voter2);

    jest.spyOn(voter, "isDelegate").mockReturnValue(true);
    jest.spyOn(voter2, "isDelegate").mockReturnValue(true);
});

describe("File Transactions", () => {
    it("should throw if posting unrecognized ipfs key", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("xxx", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce(voter.nonce.plus(1))
            .sign(secret);

        try {
            ipfsTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
            fail("Should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(FileKeyInvalid);
        }
    });

    it("should throw if posting invalid multihash", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("description", "XmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce(voter.nonce.plus(1))
            .sign(secret);

        try {
            ipfsTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
            fail("Should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(InvalidMultiHash);
        }
    });

    it("should pass if posting recognized ipfs key", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("description", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
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

    it("should fail if posting db.apps", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("db.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
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
            fail("Should have failed");
        } catch (error) {
            expect(error).toBeTruthy();
        }
    });

    it("should pass if posting db.doc.apps after schema registration", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("db.doc.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
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
            fail("Should have failed");
        } catch (error) {
            expect(error).toBeInstanceOf(SchemaNotFound);
        }

        const schemaBuilder = new FileTransactionBuilders.SetFileBuilder();
        const schemaTransaction = schemaBuilder
            .ipfsAsset("schema.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce(voter.nonce.plus(1))
            .fee("0")
            .sign(secret);

        try {
            schemaTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await setFileHandler.throwIfCannotBeApplied(schemaTransaction.build(), voter, walletManager);
        } catch (error) {
            fail(error);
        }

        await walletManager.applyTransaction(schemaTransaction.build());

        walletManager.reindex(voter);

        const ipfsTransaction2 = txBuilder
            .ipfsAsset("db.doc.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce(voter.nonce.plus(1))
            .fee("0")
            .sign(secret);

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction2.build(), voter, walletManager);
        } catch (error) {
            fail("Should have passed, instead got " + error);
        }
    });

    it("should fail if posting db.hello.apps", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("db.hello.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce(voter.nonce.plus(1))
            .fee("0")
            .sign(secret);

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
            fail("Should have failed");
        } catch (error) {
            expect(error).toBeTruthy();
        }
    });

    it("should fail if posting schema.json.apps", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("schema.json.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce(voter.nonce.plus(1))
            .fee("0")
            .sign(secret);

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
            fail("Should have failed");
        } catch (error) {
            expect(error).toBeTruthy();
        }
    });

    it("should pass if posting schema.apps", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("schema.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
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
    });

    it("should fail if registering existing schema", async () => {
        const txBuilder = new FileTransactionBuilders.SetFileBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("schema.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
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

        await walletManager.applyTransaction(ipfsTransaction.build());

        walletManager.reindex(voter);

        const ipfsTransaction2 = txBuilder
            .ipfsAsset("schema.apps", "QmdYwXXtzoyXWWGbAidxg2sd9gBE9k1JrYAKGf2mdKMFc5")
            .nonce("1")
            .fee("0")
            .sign(secret2);

        try {
            ipfsTransaction2.build();
        } catch (error) {
            fail(error);
        }

        try {
            await setFileHandler.throwIfCannotBeApplied(ipfsTransaction2.build(), voter2, walletManager);
            fail("should have returned error SchemaAlreadyExists");
        } catch (error) {
            expect(error).toBeInstanceOf(SchemaAlreadyExists);
        }
    });
});
