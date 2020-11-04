/* tslint:disable:max-line-length no-empty */
import "./mocks/core-container";

import * as fs from "fs";
import * as path from "path";

import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Crypto, Identities, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { Builders as StakeBuilders } from "@nosplatform/stake-transactions-crypto/src";
import { database, initDb } from "@nosplatform/stake-transactions/src";

// import {
//     DatabaseConnectionStub
// } from '../../../__tests__/unit/core-database/__fixtures__/database-connection-stub';
import { configManager } from "@arkecosystem/crypto/dist/managers";
import { WalletManager } from "../../../packages/core-state/src/wallets";
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
// let initialBalance;
// let stakeCreateHandler;
// let stakeRedeemHandler;
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
    // initialBalance = voter.balance;
    // voter.nonce = Utils.BigNumber.ZERO;
    // stakeCreateHandler = new StakeCreateTransactionHandler();
    // stakeRedeemHandler = new StakeRedeemTransactionHandler();
    // stakeCancelHandler = new StakeCancelTransactionHandler();
});

describe("Stake Redeem Transactions", () => {
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

        PowerUpHelper.powerUp(voter, stakeTransaction.id, walletManager);

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
        ExpireHelper.expireStake(voter, stakeTransaction.id, store.getLastBlock().data, walletManager);
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
        RedeemHelper.redeem(voter, stakeTransaction.id, walletManager);

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
