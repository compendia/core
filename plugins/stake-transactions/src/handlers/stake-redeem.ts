import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@nosplatform/core-transactions";
import { Interfaces, Transactions } from "@nosplatform/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import {
    StakeAlreadyRedeemedError,
    StakeNotFoundError,
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
            const txId = s.txId;
            const stake = sender.stake[txId];
            // Refund stake
            const newBalance = sender.balance.plus(stake.amount);
            const wallet: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            const newWeight = wallet.stakeWeight.minus(stake.weight);
            const redeemed = true;
            Object.assign(sender, {
                balance: newBalance,
                stakeWeight: newWeight,
                stake: {
                    ...sender.stake,
                    [txId]: {
                        ...sender.stake[txId],
                        redeemed,
                    },
                },
            });
        }
        walletManager.buildVoteBalances();
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        const sender = databaseWalletManager.findByPublicKey(wallet.publicKey);

        // Get wallet stake if it exists
        if (sender.stake === {}) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = sender.stake;
        const { data }: Interfaces.ITransaction = transaction;
        const txId = data.asset.stakeRedeem.txId;

        if (!(txId in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[txId].redeemed) {
            throw new StakeAlreadyRedeemedError();
        }

        if (!stakeArray[txId].halved) {
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
        const txId = t.asset.stakeRedeem.txId;
        const stake = sender.stake[txId];
        // Refund stake
        const newBalance = sender.balance.plus(stake.amount);
        const newWeight = sender.stakeWeight.minus(stake.weight);
        const redeemed = true;
        Object.assign(sender, {
            balance: newBalance,
            stakeWeight: newWeight,
            stake: {
                ...sender.stake,
                [txId]: {
                    ...sender.stake[txId],
                    redeemed,
                },
            },
        });
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeRedeem.txId;
        const stake = sender.stake[txId];
        // Revert refund stake
        const newBalance = sender.balance.minus(stake.amount);
        const redeemed = false;
        Object.assign(sender, {
            balance: newBalance,
            stake: {
                ...sender.stake,
                [txId]: {
                    ...sender.stake[txId],
                    redeemed,
                },
            },
        });
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
