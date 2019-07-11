import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { NotEnoughBalanceError, StakeDurationError, StakeNotIntegerError } from "../errors";
import { VoteWeight } from "../helpers";
import { StakeCreateTransaction } from "../transactions";

export class StakeCreateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeCreateTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const transactionsRepository = databaseService.transactionsBusinessRepository;
        const transactions = await transactionsRepository.findAllByType(this.getConstructor().type);

        for (const t of transactions.rows) {
            let stakeArray: StakeInterfaces.IStakeArray = [];
            const wallet: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);

            // Get wallet stake if it exists
            if (Object.keys(wallet.stake).length > 0) {
                stakeArray = wallet.stake;
            }

            // Set stake data
            const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(t);
            stakeArray[t.timestamp] = o;
            wallet.stakeWeight = wallet.stakeWeight.plus(o.weight);
            wallet.stake = stakeArray;
            wallet.balance = wallet.balance.minus(o.amount);
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        const { data }: Interfaces.ITransaction = transaction;

        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(data);

        // Amount can only be in increments of 1 NOS
        if ((o.amount.toNumber() / Constants.ARKTOSHI).toString().includes(".")) {
            throw new StakeNotIntegerError();
        }

        if (o.amount.isGreaterThan(wallet.balance.minus(Utils.BigNumber.make(data.fee)))) {
            throw new NotEnoughBalanceError();
        }

        if (!o.duration || o.duration < 7889400) {
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
        sender.stake[t.timestamp] = o;
        sender.balance = sender.balance.minus(o.amount);
        sender.stakeWeight = sender.stakeWeight.plus(o.weight);
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(t);
        sender.balance = sender.balance.plus(o.amount);
        delete sender.stake[t.timestamp];
        sender.stakeWeight = sender.stakeWeight.minus(o.weight);
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
