import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Managers, Transactions } from "@arkecosystem/crypto";
import {
    Enums,
    Interfaces as StakeInterfaces,
    Transactions as StakeTransactions,
} from "@nosplatform/stake-transactions-crypto";

import { app } from "@arkecosystem/core-container";
import { StakeAlreadyCanceledError, StakeGraceEndedError, StakeNotFoundError, WalletHasNoStakeError } from "../errors";
import { ExpireHelper } from "../helpers";
import { StakeCreateTransactionHandler } from "./stake-create";

export class StakeCancelTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeTransactions.StakeCancelTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [StakeCreateTransactionHandler];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return [];
    }

    public async isActivated(): Promise<boolean> {
        if (Managers.configManager.getMilestone().graceEnd) {
            return true;
        }

        return false;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        // TODO: get milestone belonging to transaction block height
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const s: StakeInterfaces.IStakeCancelAsset = transaction.asset.stakeCancel;
                const txId = s.id;
                // Cancel stake
                const stakes = wallet.getAttribute("stakes", {});
                const stake: StakeInterfaces.IStakeObject = stakes[txId];
                const newBalance = wallet.balance.plus(stake.amount);
                wallet.balance = newBalance;
                stake.status = "canceled";
                stakes[txId] = stake;
                await ExpireHelper.removeExpiry(transaction.id);

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
        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes", {});
        const { data }: Interfaces.ITransaction = transaction;
        const txId = data.asset.stakeCancel.id;
        const stake: StakeInterfaces.IStakeObject = stakes[txId];
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        // Get wallet stake if it exists
        if (stakes === {}) {
            throw new WalletHasNoStakeError();
        }

        if (!(txId in stakes)) {
            throw new StakeNotFoundError();
        }

        if (stake.status === "canceled") {
            throw new StakeAlreadyCanceledError();
        }

        if (
            (transaction.timestamp && transaction.timestamp > stake.timestamps.graceEnd) ||
            lastBlock.data.timestamp > stake.timestamps.graceEnd
        ) {
            throw new StakeGraceEndedError();
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
                Enums.StakeTransactionType.StakeCancel,
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
        emitter.emit("stake.redeemed", transaction.data);
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeCancel.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake = stakes[txId];

        // Refund stake
        const newBalance = sender.balance.plus(stake.amount);
        stake.status = "canceled";
        stakes[txId] = stake;
        sender.balance = newBalance;

        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

        if (walletManager.constructor.name !== "TempWalletManager") {
            await ExpireHelper.removeExpiry(transaction.id);
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
        const txId = t.asset.stakeCancel.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake: StakeInterfaces.IStakeObject = stakes[txId];

        // Revert refund stake
        const newBalance = sender.balance.minus(stake.amount);
        stake.status = "grace";
        stakes[txId] = stake;
        sender.balance = newBalance;

        if (walletManager.constructor.name !== "TempWalletManager") {
            await ExpireHelper.storeExpiry(stake, sender, txId);
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
