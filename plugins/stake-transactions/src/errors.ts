// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class StakeAssetError extends Errors.TransactionError {
    constructor() {
        super(`Invalid stake asset.`);
    }
}

export class StakeAlreadyCanceledError extends Errors.TransactionError {
    constructor() {
        super(`Stake already canceled.`);
    }
}

export class StakeNotFoundError extends Errors.TransactionError {
    constructor() {
        super(`Specified stake not found for wallet.`);
    }
}

export class WalletHasNoStakeError extends Errors.TransactionError {
    constructor() {
        super(`Wallet has no stake.`);
    }
}

export class StakeAlreadyClaimedError extends Errors.TransactionError {
    constructor() {
        super(`Stake has already been claimed.`);
    }
}

export class StakeNotYetClaimableError extends Errors.TransactionError {
    constructor() {
        super(`Stake not yet claimable.`);
    }
}

export class StakeDurationError extends Errors.TransactionError {
    constructor() {
        super(`Incorrect stake duration.`);
    }
}

export class StakeNotYetCanceledError extends Errors.TransactionError {
    constructor() {
        super(`Stake not yet canceled.`);
    }
}
