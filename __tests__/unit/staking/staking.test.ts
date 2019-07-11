/* tslint:disable:max-line-length no-empty */
import "../core-database/mocks/core-container";

import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Crypto, Identities, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { WalletManager } from "../../../packages/core-state/src/wallets";
import {
    StakeCancelTransactionHandler,
    StakeCreateTransactionHandler,
    StakeRedeemTransactionHandler,
    StakeUndoCancelTransactionHandler,
} from "../../../plugins/stake-transactions/src/handlers";

beforeAll(() => {
    Managers.configManager.setFromPreset("testnet");
    Managers.configManager.setHeight(1);
    Handlers.Registry.registerCustomTransactionHandler(StakeCreateTransactionHandler);
    Handlers.Registry.registerCustomTransactionHandler(StakeRedeemTransactionHandler);
    Handlers.Registry.registerCustomTransactionHandler(StakeCancelTransactionHandler);
    Handlers.Registry.registerCustomTransactionHandler(StakeUndoCancelTransactionHandler);
});

let walletManager: State.IWalletManager;

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter;
let initialBalance;

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
            expect(error.message).toContain("Stake not yet canceled.");
        }
    });

    it("should throw if undoing cancel of non-canceled stake", async () => {
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
            timestamp: 1234567892,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567892);

        const stakeUndoCancelTransaction = Transactions.BuilderFactory.stakeUndoCancel()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        try {
            walletManager.applyTransaction(stakeUndoCancelTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Stake not yet canceled.");
        }
    });

    it("should correctly update weight and balances on stakeUndoCancel and revert stakeUndoCancel", async () => {
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

        expect(voter.stakeWeight).toEqual(voter.stake[stakeTransaction.data.timestamp].weight);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: 1234567892,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567892);

        const stakeCancelTransaction = Transactions.BuilderFactory.stakeCancel()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();
        walletManager.applyTransaction(stakeCancelTransaction);

        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.fee)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(stakeCancelTransaction.data.fee),
        );
        expect(voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp).toEqual(1234567890 + 7889400);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: 1234567893,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567893);

        const stakeUndoCancelTransaction = Transactions.BuilderFactory.stakeUndoCancel()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();
        walletManager.applyTransaction(stakeUndoCancelTransaction);

        expect(stakeTransaction.data.fee).toEqual(Utils.BigNumber.ONE.times(ARKTOSHI));

        expect(voter.stakeWeight).toEqual(voter.stake[stakeTransaction.data.timestamp].weight);
        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.fee)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(stakeCancelTransaction.data.fee)
                .minus(stakeUndoCancelTransaction.data.fee),
        );
        expect(voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp).toEqual(0);

        walletManager.revertTransaction(stakeUndoCancelTransaction);
        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.fee)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(stakeCancelTransaction.data.fee),
        );
        expect(voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp).toEqual(1234567890 + 7889400);
    });

    it("should throw if redeeming canceled stake too soon", async () => {
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
            timestamp: 1234567892,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567892);

        const stakeCancelTransaction = Transactions.BuilderFactory.stakeCancel()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeCancelTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp - 10,
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

    it("should throw if canceling non-existent stake", async () => {
        const stakeCancelTransaction = Transactions.BuilderFactory.stakeCancel()
            .stakeAsset(1234567890)
            .sign("secret")
            .build();
        try {
            walletManager.applyTransaction(stakeCancelTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Specified stake not found for wallet.");
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

    it("should throw if stake too soon", async () => {
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
            timestamp: 1234567892,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567892);

        const stakeCancelTransaction = Transactions.BuilderFactory.stakeCancel()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        walletManager.applyTransaction(stakeCancelTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            timestamp: voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp - 10,
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
        expect(voter.stakeWeight).toEqual(stakeAmount.times(1.25));
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
            redeemableTimestamp: 0,
            redeemed: false,
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
            timestamp: 1234567892,
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567892);

        const stakeCancelTransaction = Transactions.BuilderFactory.stakeCancel()
            .stakeAsset(stakeTransaction.data.timestamp)
            .sign("secret")
            .build();

        expect(voter.stakeWeight).toEqual(stakeAmount);
        expect(voter.balance).toEqual(
            initialBalance.minus(stakeTransaction.data.fee).minus(stakeTransaction.data.asset.stakeCreate.amount),
        );
        walletManager.applyTransaction(stakeCancelTransaction);
        expect(voter.stake[stakeTransaction.data.timestamp].redeemableTimestamp).toEqual(
            voter.stake[stakeTransaction.data.timestamp].duration + stakeTransaction.data.timestamp,
        );
        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.fee)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(stakeCancelTransaction.data.fee),
        );

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
            initialBalance
                .minus(stakeTransaction.data.fee)
                .minus(stakeCancelTransaction.data.fee)
                .minus(stakeRedeemTransaction.data.fee),
        );
        expect(voter.stakeWeight).toEqual(Utils.BigNumber.ZERO);
    });
});
