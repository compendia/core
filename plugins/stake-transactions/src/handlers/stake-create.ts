import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Constants, Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import {
    Enums,
    Interfaces as StakeInterfaces,
    Transactions as StakeTransactions,
} from "@nosplatform/stake-transactions-crypto";

import {
    LessThanMinimumStakeError,
    NotEnoughBalanceError,
    StakeAlreadyExistsError,
    StakeDurationError,
    StakeNotIntegerError,
    StakeTimestampError,
} from "../errors";
import { ExpireHelper, VotePower } from "../helpers";

export class StakeCreateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeTransactions.StakeCreateTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return ["stakes", "stakePower"];
    }

    public async isActivated(): Promise<boolean> {
        return true;
    }

    public dynamicFee(context: TransactionInterfaces.IDynamicFeeContext): Utils.BigNumber {
        // override dynamicFee calculation as this is a zero-fee transaction
        return Utils.BigNumber.ZERO;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const stateService = app.resolvePlugin<State.IStateService>("state");
        const lastBlock: Interfaces.IBlock = stateService.getStore().getLastBlock();
        const roundHeight: number = roundCalculator.calculateRound(lastBlock.data.height).roundHeight;
        const roundBlock: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findByHeight(
            roundHeight,
        );

        // TODO: get milestone belonging to transaction block height
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);

                let staker: State.IWallet;
                if (transaction.recipientId) {
                    staker = walletManager.findByAddress(transaction.recipientId);
                } else {
                    staker = wallet;
                }

                const stakeObject: StakeInterfaces.IStakeObject = VotePower.stakeObject(
                    transaction.asset.stakeCreate,
                    transaction.id,
                    transaction.senderPublicKey,
                    transaction.blockHeight,
                );
                const newBalance = wallet.balance.minus(stakeObject.amount);
                const stakes = staker.getAttribute<StakeInterfaces.IStakeArray>("stakes", {});

                // TODO: Check if stake is released, active, or graced and assign to correct helper.
                let addPower: Utils.BigNumber = Utils.BigNumber.ZERO;
                if (roundBlock.timestamp >= stakeObject.timestamps.redeemable) {
                    // released
                    stakeObject.power = Utils.BigNumber.make(stakeObject.power).dividedBy(2);
                    stakeObject.status = "released";
                    addPower = stakeObject.power;
                    await ExpireHelper.removeExpiry(transaction.id);
                } else {
                    // Else if not released, check if powerUp is configured in the most recent round
                    const txRoundHeight = roundCalculator.calculateRound(transaction.blockHeight).roundHeight;
                    if (
                        !Managers.configManager.getMilestone(txRoundHeight).powerUp ||
                        roundBlock.timestamp >= stakeObject.timestamps.powerUp
                    ) {
                        // Powered up
                        stakeObject.status = "active";
                        addPower = stakeObject.power;
                    }
                    // Stake is not yet released, so store it in redis. If stakeObject.active we can skip storing it in powerUp.
                    await ExpireHelper.storeExpiry(
                        stakeObject,
                        staker,
                        transaction.id,
                        roundBlock.height,
                        stakeObject.status === "active",
                    );
                }
                wallet.balance = newBalance;
                stakes[transaction.id] = stakeObject;
                if (!addPower.isZero()) {
                    staker.setAttribute(
                        "stakePower",
                        staker.getAttribute("stakePower", Utils.BigNumber.ZERO).plus(addPower),
                    );
                }
                staker.setAttribute<StakeInterfaces.IStakeArray>("stakes", JSON.parse(JSON.stringify(stakes)));
                walletManager.reindex(wallet);
            }
        }
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        const stake: StakeInterfaces.IStakeCreateAsset = transaction.data.asset.stakeCreate;
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        let staker: State.IWallet;
        if (transaction.data.recipientId) {
            staker = walletManager.findByAddress(transaction.data.recipientId);
        } else {
            staker = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        }

        const { data }: Interfaces.ITransaction = transaction;

        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();
        if (!milestone.stakeLevels[stake.duration] || milestone.stakeLevels[stake.duration] === undefined) {
            throw new StakeDurationError();
        }

        const o: StakeInterfaces.IStakeObject = VotePower.stakeObject(
            data.asset.stakeCreate,
            transaction.id,
            data.senderPublicKey,
        );

        const timestampDiff = stake.timestamp - lastBlock.data.timestamp;

        if (
            !transaction.timestamp &&
            (timestampDiff > Managers.configManager.getMilestone().blocktime * 4 ||
                timestampDiff < Managers.configManager.getMilestone().blocktime * -4)
        ) {
            throw new StakeTimestampError();
        }

        if (transaction.id in staker.getAttribute("stakes", {})) {
            throw new StakeAlreadyExistsError();
        }

        // Amount can only be in increments of 1 NOS
        if (!o.amount.toString().endsWith(Constants.ARKTOSHI.toString().substr(1))) {
            throw new StakeNotIntegerError();
        }

        if (o.amount.isGreaterThan(wallet.balance.minus(Utils.BigNumber.make(data.fee)))) {
            throw new NotEnoughBalanceError();
        }

        if (o.amount.isLessThan(milestone.minimumStake)) {
            throw new LessThanMinimumStakeError();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, walletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<{ type: string; message: string } | null> {
        if (
            (await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.StakeTransactionType.StakeCreate,
                Enums.StakeTransactionGroup,
            )) ||
            (await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.StakeTransactionType.StakeRedeem,
                Enums.StakeTransactionGroup,
            ))
        ) {
            return {
                type: "ERR_PENDING",
                message: `Stake transaction for wallet already in the pool`,
            };
        }
        return null;
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.created", transaction.data);
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const newBalance = sender.balance.minus(transaction.data.asset.stakeCreate.amount);
        sender.balance = newBalance;
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const newBalance = sender.balance.plus(transaction.data.asset.stakeCreate.amount);
        sender.balance = newBalance;
    }

    public async applyToRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {
        let staker: State.IWallet;
        if (transaction.data.recipientId) {
            staker = walletManager.findByAddress(transaction.data.recipientId);
        } else {
            staker = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        }
        const o: StakeInterfaces.IStakeObject = VotePower.stakeObject(
            transaction.data.asset.stakeCreate,
            transaction.id,
            transaction.data.senderPublicKey,
        );

        const stakes = staker.getAttribute<StakeInterfaces.IStakeArray>("stakes", {});

        // Stake is immediately active if there's no powerUp or graceEnd period
        if (!Managers.configManager.getMilestone().powerUp || !Managers.configManager.getMilestone().graceEnd) {
            staker.setAttribute("stakePower", staker.getAttribute("stakePower", Utils.BigNumber.ZERO).plus(o.power));
            o.status = "active";
        }

        o.senderPublicKey = transaction.data.senderPublicKey;

        stakes[transaction.id] = o;

        staker.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

        // Only store the expiry if it's not a tempWalletManager
        if (walletManager.constructor.name !== "TempWalletManager") {
            await ExpireHelper.storeExpiry(o, staker, transaction.id);
        }

        walletManager.reindex(staker);
    }

    public async revertForRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {
        let staker: State.IWallet;
        if (transaction.data.recipientId) {
            staker = walletManager.findByAddress(transaction.data.recipientId);
        } else {
            staker = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        }
        const stakes = staker.getAttribute<StakeInterfaces.IStakeArray>("stakes", {});

        // If the stake is active we need to deduct the stakePower
        if (stakes[transaction.id].status === "active") {
            const stake = stakes[transaction.id];
            const stakePower = staker.getAttribute("stakePower", Utils.BigNumber.ZERO);
            staker.setAttribute("stakePower", stakePower.minus(stake.power));
            // If active + after a powerUp period and the sender has voted we update the delegate voteBalance too
            if (Managers.configManager.getMilestone().powerUp && staker.hasVoted()) {
                const delegate: State.IWallet = walletManager.findByPublicKey(staker.getAttribute("vote"));
                let voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
                voteBalance = voteBalance.minus(stake.power);
                delegate.setAttribute("delegate.voteBalance", voteBalance);
                walletManager.reindex(delegate);
            }
        }

        delete stakes[transaction.id];
        staker.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

        // Only remove the expiry if it's not a tempWalletManager
        if (walletManager.constructor.name !== "TempWalletManager") {
            await ExpireHelper.removeExpiry(transaction.id);
        }

        walletManager.reindex(staker);
    }
}
