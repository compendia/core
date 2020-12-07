import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import {
    Enums,
    Interfaces as StakeInterfaces,
    Transactions as StakeTransactions,
} from "@nosplatform/stake-transactions-crypto";

import {
    StakeDurationError,
    StakeExtendDurationTooLowError,
    StakeNotActiveError,
    StakeNotFoundError,
    WalletHasNoStakeError,
} from "../errors";
import { ExpireHelper, VotePower } from "../helpers";
import { BlockHelper } from "../helpers/block";
import { StakeCancelTransactionHandler } from "./stake-cancel";
import { StakeCreateTransactionHandler } from "./stake-create";

export class StakeExtendTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeTransactions.StakeExtendTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [StakeCreateTransactionHandler, StakeCancelTransactionHandler];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return [];
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
        databaseService.options.estimateTotalCount = true;
        const stateService = app.resolvePlugin<State.IStateService>("state");
        const lastBlock: Interfaces.IBlock = stateService.getStore().getLastBlock();
        const roundHeight: number = roundCalculator.calculateRound(lastBlock.data.height).roundHeight;
        const roundBlock: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findByHeight(
            roundHeight,
        );

        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const extendAsset: StakeInterfaces.IStakeExtendAsset = transaction.asset.stakeExtend;
                const txId = extendAsset.id;
                const stakes = wallet.getAttribute("stakes", {});
                const stake: StakeInterfaces.IStakeObject = stakes[txId];

                // Get wallet stakePower and deduct current stake's power from it
                let stakePower = wallet.getAttribute("stakePower", Utils.BigNumber.ZERO);
                stakePower = stakePower.minus(stake.power);

                // Remove from expiry db since the extended stake will have a new expiration
                ExpireHelper.removeExpiry(stake.id);

                // Update stake duration
                const newDuration = transaction.asset.stakeExtend.duration;
                stake.duration = newDuration;

                // Update timestamps and status
                const extendBlock: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findByHeight(
                    transaction.blockHeight - 1,
                );
                const newRedeemable = extendBlock.timestamp + transaction.asset.stakeExtend.duration;
                stake.timestamps.redeemable = newRedeemable;
                stake.timestamps.redeemAt = undefined;
                stake.status = "active";

                // Update extended stake object's power
                const multiplier: number = Managers.configManager.getMilestone().stakeLevels[newDuration];
                const amount = Utils.BigNumber.make(stake.amount);
                const sPower: Utils.BigNumber = amount.times(multiplier).dividedBy(10);
                stake.power = sPower;

                // Add the extended stake object's power to wallet stakePower
                stakePower = stakePower.plus(stake.power);

                // Add stake back to db
                // Skip powerUp queue because the stake is always already active here since we're at a point where an extension can be made (and reverted)
                ExpireHelper.storeExpiry(stake, wallet, stake.id, true);

                // Set stake to "released" if the redeemable time has surpassed the last round's time.
                if (roundBlock.timestamp >= stake.timestamps.redeemable) {
                    const releaseEffectiveFrom = await BlockHelper.getEffectiveBlockHeight(stake.timestamps.redeemable);
                    if (lastBlock.data.height >= releaseEffectiveFrom) {
                        // Remove stake object's power from wallet stakePower
                        stakePower = stakePower.minus(stake.power);
                        // Halve the stake power and update status
                        stake.power = Utils.BigNumber.make(stake.power).dividedBy(2);
                        stake.status = "released";
                        // Re-add the released stake's power to the wallet stakePower
                        stakePower = stakePower.plus(stake.power);
                        // Set "released" (2) status in in-mem db
                        ExpireHelper.setReleased(transaction.id);
                    }
                }
                stakes[txId] = stake;
                wallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
                wallet.setAttribute("stakePower", stakePower);
                walletManager.reindex(wallet);
            }
        }
        databaseService.options.estimateTotalCount = !process.env.CORE_API_NO_ESTIMATED_TOTAL_COUNT;
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): Promise<void> {
        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes", {});
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();

        // Get wallet stake if it exists
        if (stakes === {}) {
            throw new WalletHasNoStakeError();
        }

        const { data }: Interfaces.ITransaction = transaction;
        const txId = data.asset.stakeExtend.id;

        if (
            !milestone.stakeLevels[data.asset.stakeExtend.duration] ||
            milestone.stakeLevels[data.asset.stakeExtend.duration] === undefined
        ) {
            throw new StakeDurationError();
        }

        if (!(txId in stakes)) {
            throw new StakeNotFoundError();
        }

        if (stakes[txId].status !== "active" && stakes[txId].status !== "released") {
            throw new StakeNotActiveError();
        }

        if (data.asset.stakeExtend.duration < stakes[txId].duration) {
            throw new StakeExtendDurationTooLowError();
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
                Enums.StakeTransactionType.StakeExtend,
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
        emitter.emit("stake.extend", transaction.data);
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeExtend.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake: StakeInterfaces.IStakeObject = stakes[txId];
        const originalPower = stake.power;

        // Remove from stake db since the stake will have a new redeem time
        ExpireHelper.removeExpiry(stake.id);

        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        // Set new duration
        const newDuration = transaction.data.asset.stakeExtend.duration;
        stake.duration = newDuration;
        let stakePower = sender.getAttribute("stakePower", Utils.BigNumber.ZERO);

        // Deduct current stake power
        stakePower = stakePower.minus(stake.power);

        const newRedeemable = lastBlock.data.timestamp + t.asset.stakeExtend.duration;
        stake.timestamps.redeemable = newRedeemable;

        stake.timestamps.redeemAt = undefined;
        stake.status = "active";

        // Set new power
        const multiplier: number = Managers.configManager.getMilestone().stakeLevels[t.asset.stakeExtend.duration];
        const amount = Utils.BigNumber.make(stake.amount);
        const sPower: Utils.BigNumber = amount.times(multiplier).dividedBy(10);
        stake.power = sPower;
        stakePower = stakePower.plus(stake.power);
        sender.setAttribute("stakePower", stakePower);

        // Save new stake data
        stakes[txId] = stake;

        // Add to expiration queue db with new attributes
        // Skip powerUp queue since stake can only be extended if active (or released)
        ExpireHelper.storeExpiry(stake, sender, stake.id, true);

        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

        // If sender has voted we should update the delegate voteBalance
        if (sender.hasVoted()) {
            const delegate: State.IWallet = walletManager.findByPublicKey(sender.getAttribute("vote"));
            let voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
            // Deduct stake's previous power & add new stake power
            voteBalance = voteBalance.minus(originalPower).plus(stake.power);
            delegate.setAttribute("delegate.voteBalance", voteBalance);
            walletManager.reindex(delegate);
        }

        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const stakeId = t.asset.stakeExtend.id;
        const stakes = sender.getAttribute("stakes", {});

        // Remove the stake from ExpireHelper db
        ExpireHelper.removeExpiry(stakeId);

        /*
         * Rebuild the stake's state by iterating through its create tx + extensions
         */

        const connection: Database.IConnection = app.resolvePlugin<Database.IDatabaseService>("database").connection;

        // Get the stakeCreate transaction and generate stake object
        const dbStakeCreateTransaction = await connection.transactionsRepository.findById(stakeId);
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");

        const blockFromCreateTx: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findById(
            dbStakeCreateTransaction.blockId,
        );

        // Get the stake object
        const stake: StakeInterfaces.IStakeObject = VotePower.stakeObject(
            dbStakeCreateTransaction.asset.stakeCreate,
            stakeId,
            dbStakeCreateTransaction.senderPublicKey,
            blockFromCreateTx.timestamp,
        );

        // Find all stake extensions of this wallet
        const dbExtendTransactions = await connection.transactionsRepository.search({
            parameters: [
                {
                    field: "senderPublicKey",
                    value: transaction.data.senderPublicKey,
                    operator: Database.SearchOperator.OP_EQ,
                },
                {
                    field: "type",
                    value: Enums.StakeTransactionType.StakeExtend,
                    operator: Database.SearchOperator.OP_EQ,
                },
                {
                    field: "typeGroup",
                    value: transaction.data.typeGroup,
                    operator: Database.SearchOperator.OP_EQ,
                },
            ],
            orderBy: [
                {
                    direction: "asc",
                    field: "nonce",
                },
            ],
        });

        // Get current state total stakePower
        let stakePower = sender.getAttribute("stakePower", Utils.BigNumber.ZERO);

        // Remove current stake power
        stakePower = stakePower.minus(stakes[stakeId].power);

        // Add original stake power.
        // Now the stake + stakePower state are as if the original stake was just created.
        stakePower = stakePower.plus(stake.power);

        // Iterate through all extend transactions and update the stake object
        for (const extendTx of dbExtendTransactions.rows) {
            // Skip if handling this transaction (since it's reverted)
            if (extendTx.id === transaction.id) {
                continue;
            }

            // Handle only the stake that this extension tx belongs to
            if (extendTx.asset.stakeExtend.id === stake.id) {
                const newDuration = extendTx.asset.stakeExtend.duration;
                stake.duration = newDuration;

                // Remove previous stake power
                stakePower = stakePower.minus(stake.power);

                const blockFromExtendTx: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findById(
                    extendTx.blockId,
                );

                const multiplier: number = Managers.configManager.getMilestone(blockFromExtendTx.height).stakeLevels[
                    t.asset.stakeExtend.duration
                ];

                const amount = Utils.BigNumber.make(stake.amount);
                const sPower: Utils.BigNumber = amount.times(multiplier).dividedBy(10);
                stake.power = sPower;
                stakePower = stakePower.plus(stake.power);

                // Update timestamps and stake status
                const newRedeemable =
                    transaction.timestamp -
                    Managers.configManager.getMilestone(blockFromExtendTx.height).blockTime +
                    t.asset.stakeExtend.duration;
                stake.timestamps.redeemable = newRedeemable;
                stake.timestamps.redeemAt = undefined;
                stake.status = "active";
            }
        }

        // Add stake back to db
        // Skip powerUp queue because the stake is always already active here since we're at a point where an extension can be made (and reverted)
        ExpireHelper.storeExpiry(stake, sender, stake.id, true);

        // Set stake to "released" if the redeemable time has surpassed the last round's time.
        // Add to "released" db for cron.
        const releaseEffectiveFrom = await BlockHelper.getEffectiveBlockHeight(stake.timestamps.redeemable);
        const stateService = app.resolvePlugin<State.IStateService>("state");
        const lastBlock: Interfaces.IBlock = stateService.getStore().getLastBlock();
        if (lastBlock.data.height >= releaseEffectiveFrom) {
            // Deduct wallet stakePower and re-add it when the stake's power is halved
            stakePower = stakePower.minus(stake.power);
            stake.power = Utils.BigNumber.make(stake.power).dividedBy(2);
            stake.status = "released";
            stakePower = stakePower.plus(stake.power);
            ExpireHelper.setReleased(transaction.id);
        }

        // If sender has voted we should update the delegate voteBalance
        if (sender.hasVoted()) {
            const delegate: State.IWallet = walletManager.findByPublicKey(sender.getAttribute("vote"));
            let voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
            // Deduct most recent stake power & add new stake power
            voteBalance = voteBalance.minus(stakes[stakeId].power).plus(stake.power);
            delegate.setAttribute("delegate.voteBalance", voteBalance);
            walletManager.reindex(delegate);
        }

        stakes[stakeId] = stake;
        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
        sender.setAttribute("stakePower", stakePower);

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
