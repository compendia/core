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
                const stakeObject: StakeInterfaces.IStakeObject = VotePower.stakeObject(
                    transaction.asset.stakeCreate,
                    transaction.id,
                    transaction.blockHeight,
                );
                const newBalance = wallet.balance.minus(stakeObject.amount);
                const stakes = wallet.getAttribute<StakeInterfaces.IStakeArray>("stakes", {});

                // TODO: Check if stake is expired, active, or graced and assign to correct helper.
                let addPower: Utils.BigNumber = Utils.BigNumber.ZERO;
                if (roundBlock.timestamp > stakeObject.timestamps.redeemable) {
                    // Expired
                    stakeObject.power = Utils.BigNumber.make(stakeObject.power).dividedBy(2);
                    stakeObject.status = "expired";
                    addPower = stakeObject.power;
                    await ExpireHelper.removeExpiry(transaction.id);
                } else {
                    // Else if not expired, check if powerUp is configured in the most recent round
                    const txRoundHeight = roundCalculator.calculateRound(transaction.blockHeight).roundHeight;
                    if (
                        !Managers.configManager.getMilestone(txRoundHeight).powerUp ||
                        roundBlock.timestamp >= stakeObject.timestamps.powerUp
                    ) {
                        // Powered up
                        stakeObject.status = "active";
                        addPower = stakeObject.power;
                    }
                    // Stake is not yet expired, so store it in redis. If stakeObject.active we can skip storing it in powerUp.
                    await ExpireHelper.storeExpiry(
                        stakeObject,
                        wallet,
                        transaction.id,
                        roundBlock.height,
                        stakeObject.status === "active",
                    );
                }
                wallet.balance = newBalance;
                stakes[transaction.id] = stakeObject;
                if (!addPower.isZero()) {
                    wallet.setAttribute(
                        "stakePower",
                        wallet.getAttribute("stakePower", Utils.BigNumber.ZERO).plus(addPower),
                    );
                }
                wallet.setAttribute<StakeInterfaces.IStakeArray>("stakes", JSON.parse(JSON.stringify(stakes)));
                walletManager.reindex(wallet);
            }
        }
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): Promise<void> {
        const stake: StakeInterfaces.IStakeCreateAsset = transaction.data.asset.stakeCreate;
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        const { data }: Interfaces.ITransaction = transaction;

        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();
        if (!milestone.stakeLevels[stake.duration] || milestone.stakeLevels[stake.duration] === undefined) {
            throw new StakeDurationError();
        }

        const o: StakeInterfaces.IStakeObject = VotePower.stakeObject(data.asset.stakeCreate, transaction.id);

        const timestampDiff = stake.timestamp - lastBlock.data.timestamp;

        if (
            !transaction.timestamp &&
            (timestampDiff > Managers.configManager.getMilestone().blocktime * 4 ||
                timestampDiff < Managers.configManager.getMilestone().blocktime * -4)
        ) {
            throw new StakeTimestampError();
        }

        if (transaction.id in wallet.getAttribute("stakes", {})) {
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

        return super.throwIfCannotBeApplied(transaction, wallet, databaseWalletManager);
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
        const o: StakeInterfaces.IStakeObject = VotePower.stakeObject(
            transaction.data.asset.stakeCreate,
            transaction.id,
        );
        const newBalance = sender.balance.minus(o.amount);
        const stakes = sender.getAttribute<StakeInterfaces.IStakeArray>("stakes", {});

        // Stake is immediately active if there's no powerUp or graceEnd period
        if (!Managers.configManager.getMilestone().powerUp || !Managers.configManager.getMilestone().graceEnd) {
            sender.setAttribute("stakePower", sender.getAttribute("stakePower", Utils.BigNumber.ZERO).plus(o.power));
            o.status = "active";
        }

        stakes[transaction.id] = o;

        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
        sender.balance = newBalance;

        // Only store the expiry if it's not a tempWalletManager
        if (walletManager.constructor.name !== "TempWalletManager") {
            await ExpireHelper.storeExpiry(o, sender, transaction.id);
        }

        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const o: StakeInterfaces.IStakeObject = VotePower.stakeObject(
            transaction.data.asset.stakeCreate,
            transaction.id,
        );
        const newBalance = sender.balance.plus(o.amount);
        const stakes = sender.getAttribute<StakeInterfaces.IStakeArray>("stakes", {});

        // If the stake is active we need to deduct the stakePower
        if (stakes[transaction.id].status === "active") {
            const stake = stakes[transaction.id];
            const stakePower = sender.getAttribute("stakePower", Utils.BigNumber.ZERO);
            sender.setAttribute("stakePower", stakePower.minus(stake.power));
            // If there's a powerUp period and the sender has voted we update the delegate voteBalance too
            if (Managers.configManager.getMilestone().powerUp && sender.hasVoted()) {
                const delegate: State.IWallet = walletManager.findByPublicKey(sender.getAttribute("vote"));
                let voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
                voteBalance = voteBalance
                    .minus(stake.power)
                    .plus(transaction.data.fee)
                    .plus(stake.amount);
                delegate.setAttribute("delegate.voteBalance", voteBalance);
                walletManager.reindex(delegate);
            }
        }

        delete stakes[transaction.id];
        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
        sender.balance = newBalance;

        // Only remove the expiry if it's not a tempWalletManager
        if (walletManager.constructor.name !== "TempWalletManager") {
            await ExpireHelper.removeExpiry(transaction.id);
        }

        walletManager.reindex(sender);
    }

    public async applyToRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {}

    public async revertForRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {}
}
