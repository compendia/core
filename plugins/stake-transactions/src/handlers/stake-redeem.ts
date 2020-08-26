import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
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
import { ExpireHelper } from "../helpers";
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
        // TODO: get milestone belonging to transaction block height
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const s: StakeInterfaces.IStakeRedeemAsset = transaction.asset.stakeRedeem;
                const txId = s.id;
                // Refund stake
                const stakes = wallet.getAttribute("stakes", {});
                const stake: StakeInterfaces.IStakeObject = stakes[txId];
                const newBalance = wallet.balance.plus(stake.amount);
                const newPower = wallet.getAttribute("stakePower", Utils.BigNumber.ZERO).minus(stake.power);
                stake.status = "redeemed";
                stakes[txId] = stake;
                ExpireHelper.removeExpiry(transaction.id);
                wallet.balance = newBalance;
                wallet.setAttribute<StakeInterfaces.IStakeArray>("stakes", JSON.parse(JSON.stringify(stakes)));
                wallet.setAttribute<Utils.BigNumber>("stakePower", newPower);
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

        if (stakes[txId].status === "redeemed") {
            throw new StakeAlreadyRedeemedError();
        }

        // TODO: Get transaction's block round timestamp instead of transaction timestamp.
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
        emitter.emit("stake.redeemed", transaction.data);
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
        const stake = stakes[txId];

        // Refund stake
        const newBalance = sender.balance.plus(stake.amount);
        const newPower = sender.getAttribute("stakePower").minus(stake.power);
        stake.status = "redeemed";
        stakes[txId] = stake;

        sender.balance = newBalance;
        sender.setAttribute("stakePower", newPower);
        sender.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

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
        // Revert refund stake
        const newBalance = sender.balance.minus(stake.amount);
        const newPower = sender.getAttribute("stakePower", Utils.BigNumber.ZERO).plus(stake.power);
        stake.status = "redeemed";
        stakes[txId] = stake;

        sender.balance = newBalance;
        sender.setAttribute("stakePower", newPower);
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
