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
    StakeAlreadyCanceledError,
    StakeAlreadyRedeemedError,
    StakeNotFoundError,
    StakeNotYetRedeemableError,
    WalletHasNoStakeError,
} from "../errors";
import { BlockHelper } from "../helpers/block";
import { RedeemHelper } from "../helpers/redeem";
import { StakeCancelTransactionHandler } from "./stake-cancel";
import { StakeCreateTransactionHandler } from "./stake-create";

export class StakeRedeemTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeTransactions.StakeRedeemTransaction;
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
                const s: StakeInterfaces.IStakeRedeemAsset = transaction.asset.stakeRedeem;
                const txId = s.id;
                const stakes = wallet.getAttribute("stakes", {});
                const stake: StakeInterfaces.IStakeObject = stakes[txId];
                stake.status = "redeeming";
                const redeemDelay: number = Managers.configManager.getMilestone(transaction.blockHeight).redeemTime;
                const redeemBlock: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findByHeight(
                    transaction.blockHeight - 1,
                );

                // Get the time that the stake should be redeemeed
                const redeemTime = redeemBlock.timestamp + redeemDelay;
                stake.timestamps.redeemAt = redeemTime;
                RedeemHelper.setRedeeming(txId, stake.timestamps.redeemAt);

                // If the current round timestamp has already passed the "redeemAt" timestamp
                // and the exact block that the stake should be redeemed has passed
                // then the stake should be redeemed.
                if (roundBlock.timestamp >= stake.timestamps.redeemAt) {
                    const redeemedEffectiveFrom = await BlockHelper.getEffectiveBlockHeight(redeemTime);
                    if (lastBlock.data.height >= redeemedEffectiveFrom) {
                        const stakePower: Utils.BigNumber = wallet.getAttribute("stakePower", Utils.BigNumber.ZERO);
                        // Set status
                        stake.status = "redeemed";
                        // Remove from wallet stakePower
                        wallet.setAttribute("stakePower", stakePower.minus(stake.power));
                        // Add to balance
                        wallet.balance = wallet.balance.plus(stake.amount);

                        // Remove pending redeem from cron job queue since the stake is already redeemed
                        RedeemHelper.removeRedeem(stake.id);
                    }
                }

                stakes[txId] = stake;
                wallet.setAttribute<StakeInterfaces.IStakeArray>("stakes", JSON.parse(JSON.stringify(stakes)));
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

        // Get wallet stake if it exists
        if (stakes === {}) {
            throw new WalletHasNoStakeError();
        }

        const { data }: Interfaces.ITransaction = transaction;
        const txId = data.asset.stakeRedeem.id;

        if (!(txId in stakes)) {
            throw new StakeNotFoundError();
        }

        if (stakes[txId].status === "canceled") {
            throw new StakeAlreadyCanceledError();
        }

        if (stakes[txId].status === "redeeming" || stakes[txId].status === "redeemed") {
            throw new StakeAlreadyRedeemedError();
        }

        if (
            (!transaction.timestamp && stakes[txId].status !== "released") ||
            (transaction.timestamp && transaction.timestamp < stakes[txId].timestamps.redeemable)
        ) {
            throw new StakeNotYetRedeemableError();
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
        emitter.emit("stake.redeeming", transaction.data);
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeRedeem.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake: StakeInterfaces.IStakeObject = stakes[txId];

        const redeemTime: number = Managers.configManager.getMilestone().redeemTime;
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        const redeemAt = lastBlock.data.timestamp + redeemTime;
        stake.timestamps.redeemAt = redeemAt;

        // Refund stake
        // const newBalance = sender.balance.plus(stake.amount);
        // const newPower = sender.getAttribute("stakePower").minus(stake.power);
        stake.status = "redeeming";
        stakes[txId] = stake;

        // sender.balance = newBalance;
        // sender.setAttribute("stakePower", newPower);
        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
        if (walletManager.constructor.name !== "TempWalletManager") {
            RedeemHelper.setRedeeming(txId, redeemAt);
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
        const txId = t.asset.stakeRedeem.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake = stakes[txId];

        // If stake was already redeemed we need to add back the stake's vote power
        // and revert the amount from staker balance
        if (stake.status === "redeemed") {
            const stakePower = sender.getAttribute("stakePower", Utils.BigNumber.ZERO);
            sender.setAttribute("stakePower", stakePower.plus(stake.power));
            sender.balance = sender.balance.minus(stake.amount);
        }

        stake.status = "released";
        stake.timestamps.redeemAt = undefined;
        stakes[txId] = stake;

        // sender.balance = newBalance;
        // sender.setAttribute("stakePower", newPower);
        if (walletManager.constructor.name !== "TempWalletManager") {
            RedeemHelper.revertRedeeming(txId);
        }
        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

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
