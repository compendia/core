/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import * as fs from "fs";
import * as path from "path";

import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Crypto, Identities, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { configManager } from "@arkecosystem/crypto/dist/managers";
import { Builders as StakeBuilders } from "@nosplatform/stake-transactions-crypto/src";
import { database, initDb } from "@nosplatform/stake-transactions/src";

// import {
//     DatabaseConnectionStub
// } from '../../../__tests__/unit/core-database/__fixtures__/database-connection-stub';
import { Staking } from "@nosplatform/core-helpers";
import { WalletManager } from "../../../packages/core-state/src/wallets";
import {
    LessThanMinimumStakeError,
    NotEnoughBalanceError,
    StakeGraceEndedError,
    StakeNotFoundError,
    StakeNotIntegerError,
    StakeNotYetRedeemableError,
    StakeTimestampError,
    WalletNotStakerError,
} from "../src/errors";
import {
    StakeCancelTransactionHandler,
    StakeCreateTransactionHandler,
    StakeRedeemTransactionHandler,
} from "../src/handlers";
import { ExpireHelper, PowerUpHelper, RedeemHelper } from "../src/helpers";

// import { ExpireHelper } from '../src/helpers';

beforeAll(async () => {
    database.exec(`
    DROP TABLE IF EXISTS stakes
`);

    initDb();
    const dbPath = path.resolve(__dirname, `../../storage/databases/unitnet.sqlite`);
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    Managers.configManager.setFromPreset("nospluginnet");
    Managers.configManager.setHeight(12);
    Handlers.Registry.registerTransactionHandler(StakeCreateTransactionHandler);
    Handlers.Registry.registerTransactionHandler(StakeRedeemTransactionHandler);
    Handlers.Registry.registerTransactionHandler(StakeCancelTransactionHandler);
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter: State.IWallet;
let initialBalance;
let stakeCreateHandler;
let stakeRedeemHandler;
// let stakeCancelHandler;
// let databaseService: Database.IDatabaseService;
let walletManager: State.IWalletManager;

beforeEach(() => {
    // databaseService = {
    //     connection: new DatabaseConnectionStub(),
    // } as Database.IDatabaseService;

    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase("secret");
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter.balance = stakeAmount.times(10);
    initialBalance = voter.balance;
    // voter.nonce = Utils.BigNumber.ZERO;
    stakeCreateHandler = new StakeCreateTransactionHandler();
    stakeRedeemHandler = new StakeRedeemTransactionHandler();
    // stakeCancelHandler = new StakeCancelTransactionHandler();
});

describe("Stake Redeem Transactions", () => {
    it("should throw if redeeming stake too soon", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.redeemable - 10,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(
            voter.getAttribute("stakes")[stakeTransaction.id].timestamps.redeemable - 10,
        );

        const redeemBuilder = new StakeBuilders.StakeRedeemBuilder();
        const stakeRedeemTransaction = redeemBuilder
            .stakeAsset(stakeTransaction.id)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret");

        await expect(
            stakeRedeemHandler.throwIfCannotBeApplied(stakeRedeemTransaction.build(), voter, walletManager),
        ).rejects.toThrowError(StakeNotYetRedeemableError);
    });

    it("should throw if redeeming non-existent stake", async () => {
        const redeemBuilder = new StakeBuilders.StakeRedeemBuilder();
        const stakeRedeemTransaction = redeemBuilder
            .stakeAsset("3637383930363738393036373839303637383930363738393036373839301234")
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret");

        await expect(
            stakeRedeemHandler.throwIfCannotBeApplied(stakeRedeemTransaction.build(), voter, walletManager),
        ).rejects.toThrowError(StakeNotFoundError);
    });

    it('should only update vote balances after reverting a stake redeem with "redeemed" status', async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1000 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1000);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.redeemable + 1000,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(
            voter.getAttribute("stakes")[stakeTransaction.id].timestamps.redeemable + 1000,
        );

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.getAttribute("stakePower")).toEqual(
            stakeAmount.times(configManager.getMilestone().stakeLevels["7889400"]).dividedBy(10),
        );

        walletManager.reindex(delegateWallet);

        const voterStakePower = Utils.BigNumber.make(50000).times(1e8);
        expect(voter.getAttribute("stakePower")).toEqual(voterStakePower);

        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voterStakePower),
        );

        // const stakes = voter.getAttribute("stakes");

        // Release the stake
        const halvedVoterStakePower = voterStakePower.div(2).toFixed();
        ExpireHelper.expireStake(voter.address, stakeTransaction.id, store.getLastBlock().data, walletManager);
        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(halvedVoterStakePower),
        );
        expect(voter.getAttribute("stakes")[stakeTransaction.id].status).toEqual("released");

        // voter.setAttribute("stakes", stakes);
        // voter.setAttribute("stakePower", Utils.BigNumber.make(halvedVoterStakePower));

        const redeemBuilder = new StakeBuilders.StakeRedeemBuilder();
        const stakeRedeemTransaction = redeemBuilder
            .stakeAsset(stakeTransaction.id)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeRedeemTransaction);
        walletManager.reindex(voter);
        expect(voter.getAttribute("stakes")[stakeTransaction.id].status).toEqual("redeeming");
        expect(voter.getAttribute("stakePower")).toEqual(Utils.BigNumber.make(halvedVoterStakePower));
        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(halvedVoterStakePower),
        );

        await walletManager.revertTransaction(stakeRedeemTransaction);
        walletManager.reindex(voter);

        // Stake is reverted to "released". Should still be halved stakePower.
        expect(voter.getAttribute("stakes")[stakeTransaction.id].status).toEqual("released");
        expect(voter.getAttribute("stakePower")).toEqual(Utils.BigNumber.make(halvedVoterStakePower));
        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(halvedVoterStakePower),
        );

        // oldBalance is balance - stake
        const oldBalance = voter.balance;

        // Apply again so we can revert at "redeemed" stage
        await walletManager.applyTransaction(stakeRedeemTransaction);
        walletManager.reindex(voter);

        // Stake is now redeeming
        expect(voter.getAttribute("stakes")[stakeTransaction.id].status).toEqual("redeeming");

        // Cron job redeems the stake
        RedeemHelper.redeem(voter.address, stakeTransaction.id, walletManager);

        // Stake is "redeemed".
        // Stake power should be 0 and power should be balance only (no more stakePower)
        expect(voter.getAttribute("stakes")[stakeTransaction.id].status).toEqual("redeemed");
        expect(voter.balance).toEqual(oldBalance.plus(stakeAmount));
        expect(voter.getAttribute("stakePower")).toEqual(Utils.BigNumber.ZERO);
        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(delegateWallet.balance.plus(voter.balance));

        await walletManager.revertTransaction(stakeRedeemTransaction);
        walletManager.reindex(voter);

        // Redeem reverted. Stake should be "released".
        // stakePower should be released stake power again.
        // Balance should be back to oldBalance.
        // Delegate voteBalance should be back to oldBalance plus halved stake power.
        expect(voter.getAttribute("stakes")[stakeTransaction.id].status).toEqual("released");
        expect(voter.balance).toEqual(oldBalance);
        expect(voter.getAttribute("stakePower")).toEqual(Utils.BigNumber.make(halvedVoterStakePower));

        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(halvedVoterStakePower),
        );
    });
});

describe("Stake Create Transactions", () => {
    it("should throw if user stakes more than balance", async () => {
        voter.balance = stakeAmount.minus(1_000 * ARKTOSHI);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await expect(
            stakeCreateHandler.throwIfCannotBeApplied(stakeTransaction, voter, walletManager),
        ).rejects.toThrowError(NotEnoughBalanceError);
    });

    it("should throw if user stakes less than milestone-set minimum", async () => {
        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const tx = stakeBuilder
            .stakeAsset(7889400, Utils.BigNumber.ONE.times(1e8))
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();
        await expect(stakeCreateHandler.throwIfCannotBeApplied(tx, voter, walletManager)).rejects.toThrowError(
            LessThanMinimumStakeError,
        );
    });

    it("should throw on invalid stake timestamp", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234568011);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        await expect(
            stakeCreateHandler.throwIfCannotBeApplied(stakeTransaction, voter, walletManager),
        ).rejects.toThrowError(StakeTimestampError);
    });

    it("should throw if stake is fractional", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        stakeAmount = stakeAmount.plus(6);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(15778800, stakeAmount)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await expect(
            stakeCreateHandler.throwIfCannotBeApplied(stakeTransaction, voter, walletManager),
        ).rejects.toThrowError(StakeNotIntegerError);
    });
});

describe("Stake Power-up", () => {
    it("should vote then update vote balance after 6m stake after power-up", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );
        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(15778800, stakeAmount)
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();
        await walletManager.applyTransaction(stakeTransaction).catch(error => {
            fail(error);
        });

        const store = app.resolvePlugin<State.IStateService>("state").getStore();
        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.powerUp,
            },
        });

        expect(voter.getAttribute("stakePower")).toBeFalsy();

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.getAttribute("stakePower")).toEqual(
            stakeAmount.times(configManager.getMilestone().stakeLevels["15778800"]).dividedBy(10),
        );

        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voter.getAttribute("stakePower")),
        );
    });

    it("should stake and then correctly update vote balances with vote and unvote create and reversal", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce("2")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.powerUp,
            },
        });

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(
            stakeAmount.times(configManager.getMilestone().stakeLevels["7889400"]).dividedBy(10),
        );

        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeAmount)
                .minus(stakeTransaction.data.fee)
                .minus(voteTransaction.data.fee),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voter.getAttribute("stakePower")),
        );
        expect(voter.balance).toEqual(
            Utils.BigNumber.make(initialBalance)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voter.getAttribute("stakePower")),
        );

        const graceEnd = Managers.configManager.getMilestone().graceEnd;
        const powerUp = Managers.configManager.getMilestone().powerUp;

        expect(voter.getAttribute("stakes")[stakeTransaction.id]).toEqual({
            id: stakeTransaction.id,
            amount: stakeAmount.toString(),
            duration: 7889400,
            power: stakeAmount
                .times(configManager.getMilestone().stakeLevels["7889400"])
                .dividedBy(10)
                .toString(),
            senderPublicKey: voter.publicKey,
            timestamps: {
                created: 1234567890,
                graceEnd: 1234567890 + graceEnd,
                powerUp: 1234567890 + graceEnd + powerUp,
                redeemable: 1234567890 + graceEnd + powerUp + 7889400,
            },
            status: "active",
        });

        const unvoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`-${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(unvoteTransaction);

        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee)
                .minus(unvoteTransaction.data.fee),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        await walletManager.revertTransaction(unvoteTransaction);

        jest.spyOn(app, "resolve").mockReturnValue([
            {
                publicKey: voter.address,
                stakeKey: 1234567890,
                redeemableTimestamp: 1242457290,
            },
        ]);

        await walletManager.revertTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee));

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        expect(voter.getAttribute("stakes")[stakeTransaction.id]).toBeUndefined();

        await walletManager.revertTransaction(voteTransaction);
        expect(voter.balance).toEqual(initialBalance);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);
    });

    it("should stake and then correctly update vote balances when changing vote before power-up", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        const initialVoterBalance = voter.balance;

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce("2")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.powerUp,
            },
        });

        const unvoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`-${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(unvoteTransaction);

        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee)
                .minus(unvoteTransaction.data.fee),
        );

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const delegate2Keys = Identities.Keys.fromPassphrase("delegate2");
        const delegate2Wallet = walletManager.findByPublicKey(delegate2Keys.publicKey);
        delegate2Wallet.setAttribute("delegate.username", "unittest2");
        delegate2Wallet.balance = Utils.BigNumber.make(5000);
        delegate2Wallet.setAttribute("vote", delegate2Wallet.publicKey);
        delegate2Wallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegate2Wallet.balance);
        walletManager.reindex(delegate2Wallet);

        const vote2Transaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegate2Keys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(vote2Transaction);

        expect(delegate2Wallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegate2Wallet.balance
                .plus(initialVoterBalance)
                .minus(voteTransaction.data.fee)
                .minus(unvoteTransaction.data.fee)
                .minus(vote2Transaction.data.fee),
        );
    });
});

describe("Stake Cancel Transactions", () => {
    it("should stake then fail when canceling after graceEnd", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        const voterBalanceAfterVote: Utils.BigNumber = voter.balance;

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        const newVoteBalance = delegateWallet.balance.plus(voter.balance);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(newVoteBalance);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce("2")
            .fee("0")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(voterBalanceAfterVote.minus(stakeAmount));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(newVoteBalance);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.graceEnd + 2,
            },
        });

        const cancelBuilder = new StakeBuilders.StakeCancelBuilder();
        const cancelTransaction = cancelBuilder
            .stakeAsset(stakeTransaction.data.id)
            .nonce("3")
            .sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(cancelTransaction);
            fail("Should have failed.");
        } catch (error) {
            expect(error).toBeInstanceOf(StakeGraceEndedError);
        }

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.balance).toEqual(voterBalanceAfterVote.minus(stakeTransaction.data.asset.stakeCreate.amount));

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            newVoteBalance.minus(stakeTransaction.data.asset.stakeCreate.amount).plus(voter.getAttribute("stakePower")),
        );
    });

    it("should receive stake then fail when canceling because not stake sender", async () => {
        const senderKeys = Identities.Keys.fromPassphrase("sender");
        const senderWallet = walletManager.findByPublicKey(senderKeys.publicKey);
        senderWallet.balance = Utils.BigNumber.make(30_000).times(Constants.ARKTOSHI);
        walletManager.reindex(senderWallet);

        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        const voterBalanceAfterVote: Utils.BigNumber = voter.balance;

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        const newVoteBalance = delegateWallet.balance.plus(voter.balance);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(newVoteBalance);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(senderWallet.nonce.plus(1).toString())
            .recipientId(voter.address)
            .fee("0")
            .sign("sender")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(voterBalanceAfterVote);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            newVoteBalance.plus(stakeAmount),
        );

        const cancelBuilder = new StakeBuilders.StakeCancelBuilder();
        const cancelTransaction = cancelBuilder
            .stakeAsset(stakeTransaction.data.id)
            .nonce("2")
            .sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(cancelTransaction);
            fail("Should have failed.");
        } catch (error) {
            expect(error).toBeInstanceOf(WalletNotStakerError);
        }

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.balance).toEqual(voterBalanceAfterVote);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(Staking.getPower(voter)),
        );
    });

    it("should stake then cancel and refund amount", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        const voterBalanceAfterVote: Utils.BigNumber = voter.balance;

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        const newVoteBalance = delegateWallet.balance.plus(voter.balance);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(newVoteBalance);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce("2")
            .fee("0")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(voterBalanceAfterVote.minus(stakeAmount));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(newVoteBalance);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.graceEnd - 2,
            },
        });

        const cancelBuilder = new StakeBuilders.StakeCancelBuilder();
        const cancelTransaction = cancelBuilder
            .stakeAsset(stakeTransaction.data.id)
            .nonce("3")
            .sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(cancelTransaction);
        } catch (error) {
            fail(error);
        }

        expect(voter.balance).toEqual(voterBalanceAfterVote.minus(cancelTransaction.data.fee));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            newVoteBalance.minus(cancelTransaction.data.fee),
        );
    });
});

describe("Stake Send Power-up", () => {
    it("should vote then update vote balance after receiving 6m stake after power-up", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        const senderKeys = Identities.Keys.fromPassphrase("sender");
        const senderWallet = walletManager.findByPublicKey(senderKeys.publicKey);
        senderWallet.balance = Utils.BigNumber.make(30_000).times(Constants.ARKTOSHI);
        walletManager.reindex(senderWallet);

        const senderDelegateKeys = Identities.Keys.fromPassphrase("sender delegate");
        const senderDelegateWallet = walletManager.findByPublicKey(senderDelegateKeys.publicKey);
        senderDelegateWallet.setAttribute("delegate.username", "unittest");
        senderDelegateWallet.balance = Utils.BigNumber.make(5000);
        senderDelegateWallet.setAttribute("vote", senderDelegateWallet.publicKey);
        senderDelegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", senderDelegateWallet.balance);
        walletManager.reindex(senderDelegateWallet);

        const senderVoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${senderDelegateKeys.publicKey}`])
            .nonce(senderWallet.nonce.plus(1).toString())
            .sign("sender")
            .build();

        await walletManager.applyTransaction(senderVoteTransaction);
        walletManager.reindex(senderWallet);
        walletManager.reindex(senderDelegateWallet);

        expect(senderDelegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            senderDelegateWallet.balance.plus(senderWallet.balance),
        );

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(15778800, stakeAmount)
            .nonce(senderWallet.nonce.plus(1).toString())
            .recipientId(voter.address)
            .sign("sender")
            .build();

        await walletManager.applyTransaction(stakeTransaction).catch(error => {
            fail(error);
        });

        walletManager.reindex(senderWallet);

        expect(senderWallet.balance).toEqual(
            Utils.BigNumber.make(20_000)
                .times(Constants.ARKTOSHI)
                .minus(senderVoteTransaction.data.fee),
        );

        expect(senderDelegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            senderDelegateWallet.balance.plus(senderWallet.balance),
        );

        const store = app.resolvePlugin<State.IStateService>("state").getStore();
        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.powerUp,
            },
        });

        expect(voter.getAttribute("stakePower")).toBeFalsy();

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.getAttribute("stakePower")).toEqual(
            stakeAmount.times(configManager.getMilestone().stakeLevels["15778800"]).dividedBy(10),
        );

        walletManager.reindex(delegateWallet);
        walletManager.reindex(senderWallet);

        expect(senderWallet.balance).toEqual(
            Utils.BigNumber.make(20_000)
                .times(Constants.ARKTOSHI)
                .minus(voteTransaction.data.fee),
        );

        expect(delegateWallet.getAttribute("delegate").voteBalance).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voter.getAttribute("stakePower")),
        );
    });

    it("should receive stake and then correctly update vote balances with vote and unvote create and reversal", async () => {
        const senderKeys = Identities.Keys.fromPassphrase("sender");
        const senderWallet = walletManager.findByPublicKey(senderKeys.publicKey);
        senderWallet.balance = Utils.BigNumber.make(30_000).times(Constants.ARKTOSHI);
        walletManager.reindex(senderWallet);

        const senderDelegateKeys = Identities.Keys.fromPassphrase("sender delegate");
        const senderDelegateWallet = walletManager.findByPublicKey(senderDelegateKeys.publicKey);
        senderDelegateWallet.setAttribute("delegate.username", "unittest");
        senderDelegateWallet.balance = Utils.BigNumber.make(5000);
        senderDelegateWallet.setAttribute("vote", senderDelegateWallet.publicKey);
        senderDelegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", senderDelegateWallet.balance);
        walletManager.reindex(senderDelegateWallet);

        const initSenderBalance = senderWallet.balance;

        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        const senderVoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${senderDelegateKeys.publicKey}`])
            .nonce(senderWallet.nonce.plus(1).toString())
            .sign("sender")
            .build();

        await walletManager.applyTransaction(senderVoteTransaction);
        walletManager.reindex(senderWallet);
        walletManager.reindex(senderDelegateWallet);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(senderWallet.nonce.plus(1).toString())
            .recipientId(voter.address)
            .sign("sender")
            .build();

        await walletManager.applyTransaction(stakeTransaction);
        walletManager.reindex(senderWallet);
        walletManager.reindex(senderDelegateWallet);

        expect(senderDelegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            senderDelegateWallet.balance
                .plus(initSenderBalance)
                .minus(stakeAmount)
                .minus(senderVoteTransaction.data.fee)
                .minus(stakeTransaction.data.fee),
        );

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.powerUp,
            },
        });

        PowerUpHelper.powerUp(voter.address, stakeTransaction.id, walletManager);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(
            stakeAmount.times(configManager.getMilestone().stakeLevels["7889400"]).dividedBy(10),
        );

        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee));

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voter.getAttribute("stakePower")),
        );
        expect(voter.balance).toEqual(Utils.BigNumber.make(initialBalance).minus(voteTransaction.data.fee));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance).plus(voter.getAttribute("stakePower")),
        );

        const graceEnd = Managers.configManager.getMilestone().graceEnd;
        const powerUp = Managers.configManager.getMilestone().powerUp;

        expect(voter.getAttribute("stakes")[stakeTransaction.id]).toEqual({
            id: stakeTransaction.id,
            amount: stakeAmount.toString(),
            duration: 7889400,
            power: stakeAmount
                .times(configManager.getMilestone().stakeLevels["7889400"])
                .dividedBy(10)
                .toString(),
            senderPublicKey: senderWallet.publicKey,
            timestamps: {
                created: 1234567890,
                graceEnd: 1234567890 + graceEnd,
                powerUp: 1234567890 + graceEnd + powerUp,
                redeemable: 1234567890 + graceEnd + powerUp + 7889400,
            },
            status: "active",
        });

        const unvoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`-${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(unvoteTransaction);

        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee).minus(unvoteTransaction.data.fee));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        await walletManager.revertTransaction(unvoteTransaction);

        jest.spyOn(app, "resolve").mockReturnValue([
            {
                publicKey: voter.address,
                stakeKey: 1234567890,
                redeemableTimestamp: 1242457290,
            },
        ]);

        await walletManager.revertTransaction(stakeTransaction);

        expect(senderDelegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            senderDelegateWallet.balance.plus(initSenderBalance).minus(senderVoteTransaction.data.fee),
        );

        expect(senderWallet.balance).toEqual(
            Utils.BigNumber.make(30_000)
                .times(Constants.ARKTOSHI)
                .minus(voteTransaction.data.fee),
        );

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee));

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        expect(voter.getAttribute("stakes")[stakeTransaction.id]).toBeUndefined();

        await walletManager.revertTransaction(voteTransaction);
        expect(voter.balance).toEqual(initialBalance);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);
    });

    it("should receive stake and then correctly update vote balances when changing vote before power-up", async () => {
        const senderKeys = Identities.Keys.fromPassphrase("sender");
        const senderWallet = walletManager.findByPublicKey(senderKeys.publicKey);
        senderWallet.balance = Utils.BigNumber.make(30_000).times(Constants.ARKTOSHI);
        walletManager.reindex(senderWallet);

        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        const initialVoterBalance = voter.balance;

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1")
            .sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance.plus(voter.balance),
        );

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(senderWallet.nonce.plus(1).toString())
            .recipientId(voter.address)
            .sign("sender")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        expect(voter.getAttribute("stakePower", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].timestamps.powerUp,
            },
        });

        const unvoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`-${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(unvoteTransaction);

        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee).minus(unvoteTransaction.data.fee));

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const delegate2Keys = Identities.Keys.fromPassphrase("delegate2");
        const delegate2Wallet = walletManager.findByPublicKey(delegate2Keys.publicKey);
        delegate2Wallet.setAttribute("delegate.username", "unittest2");
        delegate2Wallet.balance = Utils.BigNumber.make(5000);
        delegate2Wallet.setAttribute("vote", delegate2Wallet.publicKey);
        delegate2Wallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegate2Wallet.balance);
        walletManager.reindex(delegate2Wallet);

        const vote2Transaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegate2Keys.publicKey}`])
            .nonce(voter.nonce.plus(1).toString())
            .sign("secret")
            .build();

        await walletManager.applyTransaction(vote2Transaction);

        expect(delegate2Wallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegate2Wallet.balance
                .plus(initialVoterBalance)
                .plus(stakeAmount)
                .minus(voteTransaction.data.fee)
                .minus(unvoteTransaction.data.fee)
                .minus(vote2Transaction.data.fee),
        );
    });
});
