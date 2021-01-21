import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { Enums, Transactions as FileTransactions } from "@nosplatform/file-transactions-crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import got from "got";
import * as multibase from "multibase";
import * as multihash from "multihashes";
import { database } from "../database";
import {
    FileKeyInvalid,
    InvalidMultiHash,
    IpfsHashAlreadyExists,
    SchemaAlreadyExists,
    SchemaFeeMismatch,
    SchemaNotFound,
    SenderNotDelegate,
} from "../errors";
import { SetFileHelper } from "../helpers";
import { IDatabaseItem } from "../interfaces";
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

                // Store or update db docstore
                if (SetFileHelper.isDocTransaction(transaction.asset.fileKey)) {
                    const schema = SetFileHelper.getKey(SetFileHelper.getKey(transaction.asset.fileKey));
                    if (wallet.getAttribute(`files.${transaction.asset.fileKey}`)) {
                        this.updateDbItem(schema, transaction, wallet);
                    } else {
                        this.storeDbItem(schema, transaction, wallet);
                    }
                }

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

        if (!SetFileHelper.isDocTransaction(transaction.data.asset.fileKey) && !this.isMultihash(ipfsHash)) {
            throw new InvalidMultiHash();
        }

        if (wallet.getAttribute(`files.${realFileKey}`, "") === ipfsHash) {
            throw new IpfsHashAlreadyExists();
        }

        if (SetFileHelper.isSchemaTransaction(transaction.data.asset.fileKey)) {
            const schemaWallet: State.IWallet = walletManager.findByIndex(
                FileIndex.Schemas,
                SetFileHelper.getKey(transaction.data.asset.fileKey),
            );
            if (schemaWallet) {
                throw new SchemaAlreadyExists();
            }

            // Throw if specialFee doesn't match
            // Overwrite tx staticFee if schema registration
            if (
                Managers.configManager.getMilestone().fees.specialFees &&
                Managers.configManager.getMilestone().fees.specialFees.setFile
            ) {
                const schemaRegistrationFee =
                    Managers.configManager.getMilestone().fees.specialFees.setFile.schemaRegistration || undefined;
                if (schemaRegistrationFee && !transaction.data.fee.isEqualTo(schemaRegistrationFee)) {
                    throw new SchemaFeeMismatch();
                }
            }
        } else if (SetFileHelper.isDocTransaction(transaction.data.asset.fileKey)) {
            const schemaWallet: State.IWallet = walletManager.findByIndex(
                FileIndex.Schemas,
                // Omit db. + doc. by doing getKey twice
                SetFileHelper.getKey(SetFileHelper.getKey(transaction.data.asset.fileKey)),
            );
            if (!schemaWallet) {
                throw new SchemaNotFound();
            }
        }

        return super.throwIfCannotBeApplied(transaction, wallet, walletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<{ type: string; message: string } | null> {
        const options = app.resolveOptions("file-transactions");

        try {
            // Check if file transaction is already in pool for sender
            if (
                await pool.senderHasTransactionsOfType(
                    data.senderPublicKey,
                    Enums.FileTransactionType.SetFile,
                    Enums.FileTransactionGroup,
                )
            ) {
                return {
                    type: "ERR_PENDING",
                    message: `File transaction for wallet already in the pool.`,
                };
            }

            // Check if schema name already exists
            if (SetFileHelper.isSchemaTransaction(data.asset.fileKey)) {
                const schemaKey = SetFileHelper.getKey(data.asset.fileKey);
                const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>(
                    "database",
                );
                const dbSchema: State.IWallet = databaseService.walletManager.findByIndex(FileIndex.Schemas, schemaKey);
                if (dbSchema) {
                    return {
                        type: "ERR_SCHEMA_EXISTS",
                        message: `Schema "${schemaKey}" already exists.`,
                    };
                }
            }

            const ipfsHash = data.asset.ipfsHash;

            // Check that this file hash isn't already queued for upload
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
                    message: `Multiple File transactions for "${ipfsHash}" in transaction payload.`,
                };
            }

            const fileKeys = Object.keys(Managers.configManager.getMilestone().ipfs.maxFileSize);
            const fileKey = this.getMilestoneFileKey(data.asset.fileKey);

            // Validate that filekey is in milestones
            if (!fileKeys.includes(fileKey)) {
                // Incorrect File Key
                return {
                    type: "ERR_INVALID_FILE_KEY",
                    message: `"${fileKey}" is not a correct key.`,
                };
            }

            // Validate non-db file size
            if (!String(data.asset.fileKey).startsWith("db.")) {
                const statUrl = `${options.gateway}/api/v0/object/stat/${ipfsHash}`;
                const res = await got.get(statUrl);
                if (!res.body) {
                    // Couldn't resolve body
                    return {
                        type: "ERR_RESOLVE_STAT",
                        message: `"${statUrl}" could not be resolved.`,
                    };
                }

                const stat = JSON.parse(res.body);
                if (!stat || !stat.CumulativeSize) {
                    // Couldn't parse json body data
                    return {
                        type: "ERR_RESOLVE_STAT",
                        message: `"${statUrl}" data could not be resolved.`,
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

                // If schema, validate JSON schema format
                if (SetFileHelper.isSchemaTransaction(data.asset.fileKey)) {
                    // Download the schema file
                    try {
                        const url = `${options.gateway}/ipfs/${data.asset.ipfsHash}`;
                        const res = await got.get(url);
                        if (!res.body) {
                            // Couldn't resolve body
                            return {
                                type: "ERR_RESOLVE_STAT",
                                message: `"${url}" could not be resolved.`,
                            };
                        } else {
                            // Try to parse the schema with AJV.
                            const json = JSON.parse(res.body);
                            const ajv = new Ajv();
                            // @ts-ignore
                            addFormats(ajv);
                            const schema = ajv.compile(json);
                            if (!schema) {
                                throw new Error();
                            }
                        }
                    } catch (error) {
                        return {
                            type: "ERR_BODY_FORMAT",
                            message: `The file does not resolve to a valid JSON Schema format.`,
                        };
                    }
                }
            }

            // Validate db.doc database upload
            if (SetFileHelper.isDocTransaction(data.asset.fileKey)) {
                const url = `${options.gateway}/api/v0/dag/get?arg=${data.asset.ipfsHash}`;
                const res = await got.post(url, { timeout: 10000 });
                if (!res.body) {
                    // Couldn't resolve body
                    return {
                        type: "ERR_RESOLVE_STAT",
                        message: `"${url}" could not be resolved. Make sure your database is online.`,
                    };
                } else {
                    // Try to parse the dag data
                    const json = JSON.parse(res.body);
                    const dbKey = SetFileHelper.getKey(SetFileHelper.getKey(data.asset.fileKey));
                    // Ensure ipfs file key is same as database name
                    if (!json.name || json.name !== dbKey) {
                        return {
                            type: "ERR_DB_NAME",
                            message: `"${dbKey}" does not match schema name.`,
                        };
                    }
                    // Ensure type of db is docstore
                    if (!json.type || json.type !== "docstore") {
                        return {
                            type: "ERR_DB_TYPE",
                            message: `Database is not a docstore.`,
                        };
                    }
                }
            }
        } catch (error) {
            return {
                type: "ERROR",
                message: error,
            };
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

        if (SetFileHelper.isDocTransaction(transaction.data.asset.fileKey)) {
            // Store database item
            const schema = SetFileHelper.getKey(SetFileHelper.getKey(transaction.data.asset.fileKey));

            // If the db already exists, update it. Else store it.
            if (sender.getAttribute(`files.${transaction.data.asset.fileKey}`)) {
                this.updateDbItem(schema, transaction.data, sender);
            } else {
                this.storeDbItem(schema, transaction.data, sender);
            }
        }

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

        // Forget schema index if the reverted transaction is a schema
        if (String(transaction.data.asset.fileKey).startsWith("schema.")) {
            walletManager.forgetByIndex(FileIndex.Schemas, sender.publicKey);
        }

        // If database: revert to previous db item
        // Find all db seTfile of this wallet
        if (SetFileHelper.isDocTransaction(transaction.data.asset.fileKey)) {
            const dbEntryTransactions = await connection.transactionsRepository.search({
                parameters: [
                    {
                        field: "senderPublicKey",
                        value: transaction.data.senderPublicKey,
                        operator: Database.SearchOperator.OP_EQ,
                    },
                    {
                        field: "type",
                        value: Enums.FileTransactionType.SetFile,
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

            if (!dbEntryTransactions.rows.length) {
                this.removeDbItem(transaction.id);
            } else {
                // Update the database with the last database transaction
                for (const dbTx of dbEntryTransactions.rows) {
                    // Skip if handling this transaction (since it's reverted)
                    if (dbTx.id === transaction.id) {
                        continue;
                    }
                    // Only handle the current fileKey (schema)
                    if (dbTx.asset.fileKey === transaction.data.asset.fileKey) {
                        const schema = SetFileHelper.getKey(SetFileHelper.getKey(transaction.data.asset.fileKey));
                        const wallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
                        this.updateDbItem(schema, transaction.data, wallet);
                    }
                }
            }
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

    private storeDbItem(
        schema: string,
        transaction: Interfaces.ITransactionData | Database.IBootstrapTransaction,
        wallet: State.IWallet,
    ): void {
        const dbItem: IDatabaseItem = {
            schema,
            hash: transaction.asset.ipfsHash,
            owner: { address: wallet.address, username: wallet.getAttribute("delegate.username") },
        };
        const insertStatement = database.prepare(
            `INSERT OR IGNORE INTO databases ` +
                "(id, schema, hash, owner_address, owner_username) VALUES " +
                "(:id, :schema, :hash, :ownerAddress, :ownerUsername);",
        );
        insertStatement.run({
            id: transaction.id,
            schema,
            hash: dbItem.hash,
            ownerAddress: dbItem.owner.address,
            ownerUsername: dbItem.owner.username,
        });
    }

    private updateDbItem(
        schema: string,
        transaction: Interfaces.ITransactionData | Database.IBootstrapTransaction,
        wallet: State.IWallet,
    ): void {
        const dbItem: IDatabaseItem = {
            schema,
            hash: transaction.asset.ipfsHash,
            owner: { address: wallet.address, username: wallet.getAttribute("delegate.username") },
        };
        const updateStatement = database.prepare(`
            UPDATE databases
            SET hash = "${transaction.asset.ipfsHash}", 
            id = "${transaction.id}" 
            WHERE owner_address = :ownerAddress AND schema = :schema
        `);
        updateStatement.run({
            id: transaction.id,
            schema: dbItem.schema,
            hash: dbItem.hash,
            ownerAddress: dbItem.owner.address,
        });
    }

    private removeDbItem(id: string): void {
        const deleteStatement = database.prepare(`DELETE FROM databases WHERE id = :id`);
        deleteStatement.run({ id });
    }
}
