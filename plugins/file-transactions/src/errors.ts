// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class IpfsHashAlreadyExists extends Errors.TransactionError {
    constructor() {
        super(`This IPFS hash is already registered.`);
    }
}

export class FileKeyInvalid extends Errors.TransactionError {
    constructor() {
        super(`Invalid IPFS Key.`);
    }
}

export class SenderNotDelegate extends Errors.TransactionError {
    constructor() {
        super(`Sender must be a delegate.`);
    }
}

export class SchemaFeeMismatch extends Errors.TransactionError {
    constructor() {
        super(`Transaction fee does not match schema registration fee.`);
    }
}

export class SchemaAlreadyExists extends Errors.TransactionError {
    constructor() {
        super(`Schema already exists.`);
    }
}

export class SchemaNotFound extends Errors.TransactionError {
    constructor() {
        super(`Schema not found.`);
    }
}

export class InvalidMultiHash extends Errors.TransactionError {
    constructor() {
        super(`Invalid Multihash.`);
    }
}
