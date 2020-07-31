// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class IpfsHashAlreadyExists extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: this IPFS hash is already registered.`);
    }
}

export class SchemaAlreadyExists extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: Schema already exists.`);
    }
}

export class FileKeyInvalid extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: Invalid IPFS Key.`);
    }
}

export class SenderNotDelegate extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: Sender must be a delegate.`);
    }
}

export class InvalidMultiHash extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: Invalid Multihash.`);
    }
}
