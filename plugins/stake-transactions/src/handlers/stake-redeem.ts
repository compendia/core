import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import {
    StakeAlreadyRedeemedError,
    StakeNotFoundError,
    StakeNotYetCanceledError,
    StakeNotYetRedeemableError,
    WalletHasNoStakeError,
} from "../errors";
import { StakeRedeemTransaction } from "../transactions";

export class StakeRedeemTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeRedeemTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const transactionsRepository = databaseService.transactionsBusinessRepository;
        const transactions = await transactionsRepository.findAllByType(this.getConstructor().type);

        for (const t of transactions.rows) {
            const sender: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            const s = t.asset.stakeRedeem;
            const blockTime = s.blockTime;
            const stake = sender.stake[blockTime];
            // Refund stake
            sender.balance = sender.balance.plus(stake.amount);
            sender.stake[blockTime].redeemed = true;
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        // Get wallet stake if it exists
        if (Object.keys(wallet.stake).length < 1) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = (wallet as any).stake;
        const { data }: Interfaces.ITransaction = transaction;
        const blockTime = data.asset.stakeRedeem.blockTime;

        if (!(blockTime in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[blockTime].redeemed) {
            throw new StakeAlreadyRedeemedError();
        }

        if (stakeArray[blockTime].redeemableTimestamp === 0) {
            throw new StakeNotYetCanceledError();
        }

        if (transaction.data.timestamp < stakeArray[blockTime].redeemableTimestamp) {
            throw new StakeNotYetRedeemableError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.redeemed", transaction.data);
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
        const blockTime = t.asset.stakeRedeem.blockTime;
        const stake = sender.stake[blockTime];
        // Refund stake
        sender.balance = sender.balance.plus(stake.amount);
        sender.stake[blockTime].redeemed = true;
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeRedeem.blockTime;
        const stake = sender.stake[blockTime];
        // Revert refund stake
        sender.balance = sender.balance.minus(stake.amount);
        sender.stake[blockTime].redeemed = false;
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
