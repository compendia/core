/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Crypto, Identities, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { WalletManager } from "../../../packages/core-state/src/wallets";
import {
    StakeCreateTransactionHandler,
    StakeRedeemTransactionHandler,
} from "../../../plugins/stake-transactions/src/handlers";
import { ExpireHelper } from "../../../plugins/stake-transactions/src/helpers";

beforeAll(() => {
    Managers.configManager.setFromPreset("testnet");
    Managers.configManager.setHeight(1);
    Handlers.Registry.registerCustomTransactionHandler(StakeCreateTransactionHandler);
    Handlers.Registry.registerCustomTransactionHandler(StakeRedeemTransactionHandler);
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter;
let initialBalance;

let walletManager: State.IWalletManager;

beforeEach(() => {
    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase("secret");
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter.balance = stakeAmount.times(10);
    initialBalance = voter.balance;
});

describe("Staking Transactions", () => {
    it("should throw if redeeming non-canceled stake", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: 1234567890,
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeTransaction);
        } catch (error) {
            expect(undefined).toBe("this should have succeeded, instead: " + error);
        }

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: 1234567892,
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567892);

        const stakeRedeemTransaction = Transactions.BuilderFactory.stakeRedeem()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeRedeemTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Stake not yet redeemable.");
        }
    });

    it("should throw if redeeming stake too soon", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp - 10,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(
            voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp - 10,
        );

        const stakeRedeemTransaction = Transactions.BuilderFactory.stakeRedeem()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeRedeemTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Stake not yet redeemable.");
        }
    });

    it("should throw if redeeming non-existent stake", async () => {
        const stakeRedeemTransaction = Transactions.BuilderFactory.stakeRedeem()
            .stakeAsset(1234567890)
            .sign("secret")
            .build();
        try {
            walletManager.applyTransaction(stakeRedeemTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Specified stake not found for wallet.");
        }
    });

    it("should throw if user stakes more than balance", async () => {
        voter.balance = stakeAmount.minus(1_000 * ARKTOSHI);

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Not enough balance.");
        }
    });

    it("should throw if user stakes more than balance after fee reduction", async () => {
        voter.balance = stakeAmount;

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeTransaction);
            expect(undefined).toEqual("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Not enough balance.");
        }
    });

    it("should throw if user stakes less than milestone-set minimum", async () => {
        try {
            Transactions.BuilderFactory.stakeCreate()
                .stakeAsset(7889400, Utils.BigNumber.ONE)
                .sign("secret")
                .build();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('data.asset.stakeCreate.amount should pass "bignumber" keyword validation');
        }
    });

    it("should throw on invalid stake timestamp", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: 1234567890,
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234568011);

        try {
            walletManager.applyTransaction(stakeTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Invalid stake timestamp.");
        }
    });

    it("should throw if stake is fractional", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegate = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegate.username = "unittest";
        delegate.balance = Utils.BigNumber.make(5000);
        delegate.vote = delegate.publicKey;
        delegate.voteBalance = delegate.balance.times(0.1);
        walletManager.reindex(delegate);
        stakeAmount = stakeAmount.plus(6);

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(15778800, stakeAmount)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("not a whole number");
        }
    });

    it("should vote then update vote balance after 6m stake", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegate = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegate.username = "unittest";
        delegate.balance = Utils.BigNumber.make(5000);
        delegate.vote = delegate.publicKey;
        delegate.voteBalance = delegate.balance.times(0.1);
        walletManager.reindex(delegate);

        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1));

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .sign("secret")
            .build();

        walletManager.applyTransaction(voteTransaction);

        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1).plus(voter.balance.times(0.1)));

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(15778800, stakeAmount)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeTransaction);
        expect(voter.stakeWeight).toEqual(stakeAmount.times(1.5));
        expect(delegate.voteBalance).toEqual(
            delegate.balance
                .times(0.1)
                .plus(voter.balance.times(0.1))
                .plus(voter.stakeWeight),
        );
    });

    it("should stake and then correctly update vote balances with vote and unvote create and reversal", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegate = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegate.username = "unittest";
        delegate.balance = Utils.BigNumber.make(5000);
        delegate.vote = delegate.publicKey;
        delegate.voteBalance = delegate.balance.times(0.1);
        walletManager.reindex(delegate);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1));

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .sign("secret")
            .build();

        walletManager.applyTransaction(voteTransaction);

        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1).plus(voter.balance.times(0.1)));

        walletManager.applyTransaction(stakeTransaction);

        expect(voter.stakeWeight).toEqual(stakeAmount);
        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeAmount)
                .minus(stakeTransaction.data.fee)
                .minus(voteTransaction.data.fee),
        );
        expect(delegate.voteBalance).toEqual(
            delegate.balance
                .times(0.1)
                .plus(voter.balance.times(0.1))
                .plus(voter.stakeWeight),
        );
        expect(voter.balance).toEqual(
            Utils.BigNumber.make(initialBalance)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee),
        );
        expect(delegate.voteBalance).toEqual(
            delegate.balance
                .times(0.1)
                .plus(voter.balance.times(0.1))
                .plus(voter.stakeWeight),
        );
        expect(voter.stake[stakeTransaction.data.timestamp]).toEqual({
            amount: stakeAmount,
            duration: 7889400,
            weight: stakeAmount,
            redeemableTimestamp: stakeTransaction.data.asset.stakeCreate.timestamp + 7889400,
            redeemed: false,
            halved: false,
        });

        const unvoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`-${delegateKeys.publicKey}`])
            .sign("secret")
            .build();

        walletManager.applyTransaction(unvoteTransaction);

        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee)
                .minus(unvoteTransaction.data.fee),
        );
        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1));

        walletManager.revertTransaction(unvoteTransaction);

        jest.spyOn(app, "resolve").mockReturnValue([
            {
                publicKey: voter.publicKey,
                stakeKey: 1234567890,
                redeemableTimestamp: 1242457290,
            },
        ]);

        walletManager.revertTransaction(stakeTransaction);
        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee));
        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1).plus(voter.balance.times(0.1)));

        expect(voter.stake[stakeTransaction.data.timestamp]).toBeUndefined();

        walletManager.revertTransaction(voteTransaction);
        expect(voter.balance).toEqual(initialBalance);
        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1));
    });

    it("should create, cancel, and redeem a stake", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: 1234567890,
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(7889400, stakeAmount)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(
            voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp,
        );

        const stakeRedeemTransaction = Transactions.BuilderFactory.stakeRedeem()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeRedeemTransaction);
        expect(voter.balance).toEqual(
            initialBalance.minus(stakeTransaction.data.fee).minus(stakeRedeemTransaction.data.fee),
        );
        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
    });

    it("should halve the wallet stakeWeight and update delegate voteBalance after stake expiration", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        const stakeOneTime = 1234567890;

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: stakeOneTime,
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(stakeOneTime);

        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegate = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegate.username = "unittest";
        delegate.balance = Utils.BigNumber.make(5000);
        delegate.vote = delegate.publicKey;
        delegate.voteBalance = delegate.balance.times(0.1);
        walletManager.reindex(delegate);

        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1));

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .sign("secret")
            .build();

        walletManager.applyTransaction(voteTransaction);

        expect(delegate.voteBalance).toEqual(delegate.balance.times(0.1).plus(voter.balance.times(0.1)));

        const stakeTransaction = Transactions.BuilderFactory.stakeCreate()
            .stakeAsset(15778800, stakeAmount)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeTransaction);
        expect(voter.stakeWeight).toEqual(stakeAmount.times(1.5));
        expect(delegate.voteBalance).toEqual(
            delegate.balance
                .times(0.1)
                .plus(voter.balance.times(0.1))
                .plus(voter.stakeWeight),
        );

        const txTwoTime = 1234567890 + 16778800;

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: txTwoTime,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(txTwoTime);

        jest.spyOn(app, "has").mockReturnValue(true);
        jest.spyOn(app, "resolve").mockReturnValue([
            {
                publicKey: voter.publicKey,
                stakeKey: stakeOneTime,
                redeemableTimestamp: stakeOneTime + 15778800,
            },
        ]);

        ExpireHelper.processMonthExpirations(walletManager);

        expect(voter.stakeWeight).toEqual(
            Utils.BigNumber.make(
                stakeAmount
                    .times(1.5)
                    .dividedBy(2)
                    .toFixed(0, 1),
            ),
        );
        expect(delegate.voteBalance).toEqual(
            delegate.balance
                .times(0.1)
                .plus(voter.balance.times(0.1))
                .plus(voter.stakeWeight),
        );

        const txThreeTime = 1234567890 + 17778800;

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: txThreeTime,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(txThreeTime);

        const transferTx2 = Transactions.BuilderFactory.transfer()
            .amount(stakeAmount.times(0.1))
            .fee(
                Utils.BigNumber.make("5")
                    .times(ARKTOSHI)
                    .toString(),
            )
            .recipientId(voter.address)
            .sign("secret")
            .build();
        walletManager.applyTransaction(transferTx2);
        expect(voter.stakeWeight).toEqual(
            Utils.BigNumber.make(
                stakeAmount
                    .times(1.5)
                    .dividedBy(2)
                    .toFixed(0, 1),
            ),
        );
        expect(delegate.voteBalance).toEqual(
            delegate.balance
                .times(0.1)
                .plus(voter.balance.times(0.1))
                .plus(voter.stakeWeight),
        );
    });
});
