import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nos/stake-interfaces";
import { StakeDurationError } from "../errors";
import { VoteWeight } from "../helpers";
import { StakeCreateTransaction } from "../transactions";

export class StakeCreateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeCreateTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const transactions = await connection.transactionsRepository.getAssetsByType(this.getConstructor().type);
        for (const t of transactions) {
            let stakeArray: StakeInterfaces.IStakeArray;
            const wallet = walletManager.findByPublicKey(t.senderPublicKey);

            // Get wallet stake if it exists
            if ((wallet as any).stake.length) {
                stakeArray = (wallet as any).stake;
            }

            // Set stake data
            const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(t);
            stakeArray[t.timestamp] = o;
            (wallet as any).stakeWeight = (wallet as any).stakeWeight.plus(o.weight);
            (wallet as any).stake = stakeArray;
            (wallet as any).balance = (wallet as any).balance.minus(o.amount);
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        const { data }: Interfaces.ITransaction = transaction;
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(data);

        if (!o.duration || o.duration < 0) {
            throw new StakeDurationError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.registered", transaction.data);
    }

    public canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): boolean {
        if (this.typeFromSenderAlreadyInPool(data, pool, processor)) {
            return false;
        }
        return true;
    }

    protected applyToSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(t);
        (sender as any).stake[transaction.timestamp] = o;
        sender.balance = sender.balance.minus(o.amount);
        (sender as any).stakeWeight = (sender as any).stakeWeight.plus(o.weight);
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(t);
        sender.balance = sender.balance.plus(o.amount);
        delete (sender as any).stake[t.timestamp];
        (sender as any).stakeWeight = (sender as any).stakeWeight.minus(o.weight);
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
