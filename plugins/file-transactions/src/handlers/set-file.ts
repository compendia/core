import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { Enums, Transactions as FileTransactions } from "@nosplatform/file-transactions-crypto";
// const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
import got from "got";
import * as multibase from "multibase";
import * as multihash from "multihashes";
import {
    FileKeyInvalid,
    InvalidMultiHash,
    IpfsHashAlreadyExists,
    SchemaAlreadyExists,
    SenderNotDelegate,
} from "../errors";
import { SetFileHelper } from "../helpers";
import { FileIndex } from "../wallet-manager";

export class SetFileTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return FileTransactions.SetFileTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        const attributes = ["files"];
        const keys = Enums.FileKeys;
        for (const key of keys) {
            attributes.push(`files.${key}`);
        }
        return attributes;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const fileKey = transaction.asset.fileKey;
                const ipfsHash = transaction.asset.ipfsHash;
                wallet.setAttribute(`files.${fileKey}`, ipfsHash);
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

        // If wallet is not a delegate: throw error.
        if (!wallet.isDelegate()) {
            throw new SenderNotDelegate();
        }

        const ipfsHash = transaction.data.asset.ipfsHash;

        const fileKeys = Object.keys(Managers.configManager.getMilestone().ipfs.maxFileSize);
        const realFileKey = transaction.data.asset.fileKey;

        // Can return wildcard filekey from milestones
        const fileKey = this.getMilestoneFileKey(realFileKey);

        if (!fileKeys.includes(fileKey)) {
            // Incorrect File Key
            throw new FileKeyInvalid();
        }

        if (!this.isMultihash(ipfsHash)) {
            throw new InvalidMultiHash();
        }

        if (wallet.getAttribute(`files.${realFileKey}`, "") === ipfsHash) {
            throw new IpfsHashAlreadyExists();
        }

        if (SetFileHelper.isSchemaTransaction(transaction.data.asset.fileKey)) {
            const dbWalletManager: State.IWalletManager = app.resolvePlugin<Database.IDatabaseService>("database")
                .walletManager;
            const dbSchema: State.IWallet = dbWalletManager.findByIndex(
                FileIndex.Schemas,
                SetFileHelper.getKey(transaction.data.asset.fileKey),
            );
            if (dbSchema) {
                throw new SchemaAlreadyExists();
            }
        }

        return super.throwIfCannotBeApplied(transaction, wallet, walletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<{ type: string; message: string } | null> {
        if (
            await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.FileTransactionType.SetFile,
                Enums.FileTransactionGroup,
            )
        ) {
            return {
                type: "ERR_PENDING",
                message: `File transaction for wallet already in the pool`,
            };
        }

        if (SetFileHelper.isSchemaTransaction(data.asset.fileKey)) {
            const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
            const dbSchema: State.IWallet = databaseService.walletManager.findByIndex(
                FileIndex.Schemas,
                SetFileHelper.getKey(data.asset.fileKey),
            );
            if (dbSchema) {
                return {
                    type: "ERR_SCHEMA_EXISTS",
                    message: `Schema "${dbSchema}" already exists.`,
                };
            }
        }

        const ipfsHash = data.asset.ipfsHash;

        const ipfsRegistrationSameHashInPool = processor
            .getTransactions()
            .filter(
                transaction =>
                    transaction.type === FileTransactions.SetFileTransaction.type &&
                    transaction.typeGroup === FileTransactions.SetFileTransaction.typeGroup &&
                    transaction.asset.ipfsHash === ipfsHash,
            );
        if (ipfsRegistrationSameHashInPool.length > 1) {
            return {
                type: "ERR_CONFLICT",
                message: `Multiple File transactions for "${ipfsHash}" in transaction payload`,
            };
        }

        const fileKeys = Object.keys(Managers.configManager.getMilestone().ipfs.maxFileSize);
        const fileKey = this.getMilestoneFileKey(data.asset.fileKey);

        if (!fileKeys.includes(fileKey)) {
            // Incorrect File Key
            return {
                type: "ERR_INVALID_FILE_KEY",
                message: `"${fileKey}" is not a correct key`,
            };
        }

        // Validate non-db file size
        if (!String(data.asset.fileKey).startsWith("db.")) {
            const options = app.resolveOptions("file-transactions");
            const statUrl = `${options.gateway}/api/v0/object/stat/${data.asset.ipfsHash}`;
            const res = await got.get(statUrl);
            if (!res.body) {
                // Couldn't resolve body
                return {
                    type: "ERR_RESOLVE_STAT",
                    message: `"${statUrl}" could not be resolved`,
                };
            }

            const stat = JSON.parse(res.body);
            if (!stat || !stat.CumulativeSize) {
                // Couldn't json body data
                return {
                    type: "ERR_RESOLVE_STAT",
                    message: `"${statUrl}" data could not be resolved`,
                };
            }

            const maxFileSize = Managers.configManager.getMilestone().ipfs.maxFileSize[fileKey];
            if (stat.CumulativeSize > maxFileSize) {
                // File too big
                return {
                    type: "ERR_FILE_SIZE",
                    message: `${stat.CumulativeSize} bytes is greater than allowed max file size of ${maxFileSize}.`,
                };
            }
        }

        return null;
    }

    /*
    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("files.updated", transaction.data);
    }
    */

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        sender.setAttribute(`files.${transaction.data.asset.fileKey}`, transaction.data.asset.ipfsHash);
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

        const FileTransactions: Database.IBootstrapTransaction[] = [];
        while (reader.hasNext()) {
            FileTransactions.push(...(await reader.read()));
        }

        if (FileTransactions.length) {
            const setFileTransaction: Database.IBootstrapTransaction = FileTransactions.pop();
            const previousIpfsHash = setFileTransaction.asset.ipfsHash;
            sender.setAttribute(`files.${transaction.data.asset.fileKey}`, previousIpfsHash);
        } else {
            sender.forgetAttribute(`files.${transaction.data.asset.fileKey}`);
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

    private isString = input => {
        return typeof input === "string";
    };

    private convertToString = input => {
        if (Buffer.isBuffer(input)) {
            return multibase
                .encode("base58btc", input)
                .toString()
                .slice(1);
        }

        if (this.isString(input)) {
            return input;
        }

        return false;
    };

    private isMultihash(hash) {
        const formatted = this.convertToString(hash);
        try {
            multihash.decode(multibase.decode("z" + formatted));
            return true;
        } catch (e) {
            return false;
        }
    }

    private getMilestoneFileKey(fileKey: string): string {
        const fileKeys = Object.keys(Managers.configManager.getMilestone().ipfs.maxFileSize);
        for (const key of fileKeys) {
            // If key ends with wildcard and tx fileKey starts with the wildcard value
            if (String(key).endsWith("*") && String(fileKey).startsWith(key.replace("*", ""))) {
                fileKey = key;
            }
        }
        return fileKey;
    }
}
