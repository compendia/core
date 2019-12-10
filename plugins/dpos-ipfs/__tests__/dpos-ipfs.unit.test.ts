/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Identities, Managers, Utils } from "@arkecosystem/crypto";
import { TransactionSchemaError } from "@arkecosystem/crypto/dist/errors";

import { WalletManager } from "../../../packages/core-state/src/wallets";
import { Builders as DposIpfsBuilders } from "../../dpos-ipfs-crypto/src";
import { DposIpfsTransactionHandler } from "../src/handlers";

// import {
//     DatabaseConnectionStub
// } from '../../../__tests__/unit/core-database/__fixtures__/database-connection-stub';
// import { ExpireHelper } from '../src/helpers';

beforeAll(async () => {
    Managers.configManager.setFromPreset("testnet");
    Managers.configManager.setHeight(1);
    Handlers.Registry.registerTransactionHandler(DposIpfsTransactionHandler);
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter;
let walletManager: State.IWalletManager;
let dposIpfsHandler;

beforeEach(() => {
    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase("secret");
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter.balance = stakeAmount.times(10);
    dposIpfsHandler = new DposIpfsTransactionHandler();
});

describe("DPOS IPFS Transactions", () => {
    it("should throw if posting unrecognized ipfs key", async () => {
        const txBuilder = new DposIpfsBuilders.DposIpfsBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("xxx", "Qmb7yMk2w5BUyFB3PjMcFqkLQg45Be7M8ohWB1UbAoeuDo")
            .nonce(voter.nonce.plus(1))
            .sign("secret");

        expect(() => ipfsTransaction.build()).toThrowError(TransactionSchemaError);
    });

    it("should pass if posting recognized ipfs key", async () => {
        const txBuilder = new DposIpfsBuilders.DposIpfsBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("description", "Qmb7yMk2w5BUyFB3PjMcFqkLQg45Be7M8ohWB1UbAoeuDo")
            .nonce(voter.nonce.plus(1))
            .sign("secret");

        try {
            ipfsTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await dposIpfsHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
        } catch (error) {
            fail(error);
        }

        try {
            await walletManager.applyTransaction(ipfsTransaction.build());
        } catch (error) {
            fail(error);
        }
    });

    it("should pass if posting curation", async () => {
        const txBuilder = new DposIpfsBuilders.DposIpfsBuilder();
        const ipfsTransaction = txBuilder
            .ipfsAsset("curation", "Qmb7yMk2w5BUyFB3PjMcFqkLQg45Be7M8ohWB1UbAoeuDo")
            .nonce(voter.nonce.plus(1))
            .sign("secret");

        try {
            ipfsTransaction.build();
        } catch (error) {
            fail(error);
        }

        try {
            await dposIpfsHandler.throwIfCannotBeApplied(ipfsTransaction.build(), voter, walletManager);
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
