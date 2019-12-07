// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class IpfsHashAlreadyExists extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: this IPFS hash is already registered.`);
    }
}

export class NodeNotRegistered extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: Delegate must register a node first.`);
    }
}

export class SenderNotDelegate extends Errors.TransactionError {
    constructor() {
        super(`Failed to apply transaction: Sender is not a delegate.`);
    }
}
