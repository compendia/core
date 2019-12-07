import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import { Enums, Transactions as CuratorTransactions } from "@nosplatform/curation-crypto";

import { IpfsHashAlreadyExists, NodeNotRegistered } from "../errors";
import { SetIpfsNodeTransactionHandler } from "./set-ipfs-node";

export class CurateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return CuratorTransactions.CurateTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [SetIpfsNodeTransactionHandler];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return ["curator.ipfs"];
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());

        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                wallet.setAttribute("curator.ipfs", transaction.asset.ipfs);
                walletManager.reindex(wallet);
            }
        }
    }

    public dynamicFee(context: TransactionInterfaces.IDynamicFeeContext): Utils.BigNumber {
        // override dynamicFee calculation as this is a zero-fee transaction
        return Utils.BigNumber.ZERO;
    }

    public async isActivated(): Promise<boolean> {
        return true;
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        if (Utils.isException(transaction.data)) {
            return;
        }

        if (!wallet.hasAttribute("curator.node")) {
            throw new NodeNotRegistered();
        }

        if (wallet.getAttribute("curator.ipfs", "") === transaction.data.asset.ipfs) {
            throw new IpfsHashAlreadyExists();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, walletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<boolean> {
        if (
            (await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.CuratorTransactionType.Curate,
                Enums.CuratorTransactionGroup,
            )) ||
            (await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.CuratorTransactionType.SetIpfsNode,
                Enums.CuratorTransactionGroup,
            ))
        ) {
            processor.pushError(data, "ERR_PENDING", `Curator transaction for wallet already in the pool`);
            return false;
        }
        return true;
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("curator.ipfs.updated", transaction.data);
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);

        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        sender.setAttribute("curator.ipfs", transaction.data.asset.ipfs);

        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const connection: Database.IConnection = app.resolvePlugin<Database.IDatabaseService>("database").connection;
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const reader = await TransactionReader.create(connection, this.getConstructor());

        const curateTransactions: Database.IBootstrapTransaction[] = [];
        while (reader.hasNext()) {
            curateTransactions.push(...(await reader.read()));
        }

        if (curateTransactions.length) {
            const curateTransaction: Database.IBootstrapTransaction = curateTransactions.pop();
            const previousIpfsHash = curateTransaction.asset.ipfs;
            sender.setAttribute("curator.ipfs", previousIpfsHash);
        } else {
            sender.forgetAttribute("curator.ipfs");
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
