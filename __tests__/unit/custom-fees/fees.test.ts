import "jest-extended";

import { State } from "@arkecosystem/core-interfaces";
import { Crypto } from "@arkecosystem/crypto";
import { ITransactionData } from "@arkecosystem/crypto/dist/interfaces";

import { Delegate } from "../../../packages/core-forger/src/delegate";
import { WalletManager } from "../../../packages/core-state/src/wallets";
import { Constants, Identities, Managers, Transactions, Utils } from "../../../packages/crypto";
import { nospluginnet } from "../../../packages/crypto/src/networks";

const dummy = {
    plainPassphrase: "clay harbor enemy utility margin pretty hub comic piece aerobic umbrella acquire",
    bip38Passphrase: "6PYTQC4c2vBv6PGvV4HibNni6wNsHsGbR1qpL1DfkCNihsiWwXnjvJMU4B",
    publicKey: "03287bfebba4c7881a0509717e71b34b63f31e40021c321f89ae04f84be6d6ac37",
    address: "ANBkoGqWeTSiaEVgVzSKZd3jS7UWzv9PSo",
};

let walletManager: State.IWalletManager;

let stakeAmount;
let voterKeys;
let voter;
const ARKTOSHI = Constants.ARKTOSHI;

beforeAll(() => {
    Managers.configManager.setFromPreset("nospluginnet");
    Managers.configManager.setHeight(1000);
});

beforeEach(() => {
    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase("secret");
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter.balance = stakeAmount.times(10);
});

describe("Fee Removal", () => {
    it("should calculate removedFee and award totalFee when forging (fees > block reward)", () => {
        const optionsDefault = {
            timestamp: 1234567890,
            previousBlock: {
                id: "11111111",
                idHex: "11111111",
                height: 1000,
            },
            reward: Utils.BigNumber.make("300000000"),
        };

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const transactions: ITransactionData[] = [];

        const tx = Transactions.BuilderFactory.transfer()
            .amount(stakeAmount)
            .fee(
                Utils.BigNumber.make("15")
                    .times(ARKTOSHI)
                    .toString(),
            )
            .recipientId(voter.address)
            .sign("secret")
            .build();

        const tx2 = Transactions.BuilderFactory.transfer()
            .amount(stakeAmount.dividedBy(5))
            .fee(
                Utils.BigNumber.make("10")
                    .times(ARKTOSHI)
                    .toString(),
            )
            .recipientId(voter.address)
            .sign("secret")
            .build();

        transactions.push(tx.data);
        transactions.push(tx2.data);

        optionsDefault.timestamp = 1234567890;

        const feeObj = Utils.FeeHelper.getFeeObject(Utils.BigNumber.make("25").times(ARKTOSHI));

        expect(feeObj.toRemove.toString()).toEqual(
            Utils.BigNumber.make("145")
                .times(ARKTOSHI)
                .dividedBy(10)
                .toString(),
        );
        expect(feeObj.toReward.toString()).toEqual(
            Utils.BigNumber.make("105")
                .times(ARKTOSHI)
                .dividedBy(10)
                .toString(),
        );

        const expectedBlockData = {
            generatorPublicKey: dummy.publicKey,
            timestamp: optionsDefault.timestamp,
            previousBlock: optionsDefault.previousBlock.id,
            height: optionsDefault.previousBlock.height + 1,
            numberOfTransactions: 2,
            totalAmount: Utils.BigNumber.make(transactions[0].amount).plus(transactions[1].amount),
            removedFee: feeObj.toRemove,
            totalFee: feeObj.toReward,
            reward: optionsDefault.reward,
        };

        const delegate = new Delegate(dummy.plainPassphrase, nospluginnet.network);

        const block = delegate.forge(transactions, optionsDefault);

        for (const key in Object.keys(expectedBlockData)) {
            if (key !== undefined) {
                expect(block.data[key]).toEqual(expectedBlockData[key]);
            }
        }

        expect(block.verification).toEqual({
            containsMultiSignatures: false,
            errors: [],
            verified: true,
        });

        expect(block.transactions).toHaveLength(2);
        expect(block.transactions[0].id).toBe(transactions[0].id);
    });

    it("should calculate removedFee and award totalFee when forging (fees < block reward)", () => {
        const optionsDefault = {
            timestamp: 1234567890,
            previousBlock: {
                id: "11111111",
                idHex: "11111111",
                height: 1000,
            },
            reward: Utils.BigNumber.make("300000000"),
        };

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const transactions: ITransactionData[] = [];

        const tx = Transactions.BuilderFactory.transfer()
            .amount(stakeAmount)
            .fee(
                Utils.BigNumber.make("3")
                    .times(ARKTOSHI)
                    .toString(),
            )
            .recipientId(voter.address)
            .sign("secret")
            .build();

        transactions.push(tx.data);

        const feeObj = Utils.FeeHelper.getFeeObject(Utils.BigNumber.make("3").times(ARKTOSHI));
        expect(feeObj.toRemove).toEqual(Utils.BigNumber.make("3").times(ARKTOSHI));
        expect(feeObj.toReward).toEqual(Utils.BigNumber.ZERO);

        const expectedBlockData = {
            generatorPublicKey: dummy.publicKey,
            timestamp: optionsDefault.timestamp,
            previousBlock: optionsDefault.previousBlock.id,
            height: optionsDefault.previousBlock.height + 1,
            numberOfTransactions: 2,
            totalAmount: Utils.BigNumber.make(transactions[0].amount),
            removedFee: feeObj.toRemove,
            totalFee: feeObj.toReward,
            reward: optionsDefault.reward,
        };

        const delegate = new Delegate(dummy.plainPassphrase, nospluginnet.network);

        const block = delegate.forge(transactions, optionsDefault);

        for (const key in Object.keys(expectedBlockData)) {
            if (key !== undefined) {
                expect(block.data[key]).toEqual(expectedBlockData[key]);
            }
        }

        expect(block.verification).toEqual({
            containsMultiSignatures: false,
            errors: [],
            verified: true,
        });

        expect(block.transactions).toHaveLength(1);
        expect(block.transactions[0].id).toBe(transactions[0].id);
    });
});
