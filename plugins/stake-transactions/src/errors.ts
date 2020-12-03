// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class StakeAssetError extends Errors.TransactionError {
    constructor() {
        super(`Invalid stake asset.`);
    }
}

export class StakeTimestampError extends Errors.TransactionError {
    constructor() {
        super(`Invalid stake timestamp.`);
    }
}

export class StakeAlreadyExistsError extends Errors.TransactionError {
    constructor() {
        super(`Stake already exists.`);
    }
}

export class NotEnoughBalanceError extends Errors.TransactionError {
    constructor() {
        super(`Not enough balance.`);
    }
}

export class StakeNotIntegerError extends Errors.TransactionError {
    constructor() {
        super(`Stake amount is not a whole number.`);
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

export class WalletNotStakerError extends Errors.TransactionError {
    constructor() {
        super(`Wallet is not the creator of this stake.`);
    }
}

export class StakeAlreadyRedeemedError extends Errors.TransactionError {
    constructor() {
        super(`Stake has already been redeemed.`);
    }
}

export class StakeNotActiveError extends Errors.TransactionError {
    constructor() {
        super(`Stake is no longer active.`);
    }
}

export class StakeNotYetRedeemableError extends Errors.TransactionError {
    constructor() {
        super(`Stake not yet redeemable.`);
    }
}

export class StakeDurationError extends Errors.TransactionError {
    constructor() {
        super(`Incorrect stake duration.`);
    }
}

export class StakeGraceEndedError extends Errors.TransactionError {
    constructor() {
        super(`Stake grace period has ended.`);
    }
}

export class StakeExtendDurationTooLowError extends Errors.TransactionError {
    constructor() {
        super(`New duration should be equal to or greater than existing duration.`);
    }
}

export class StakeAlreadyCanceledError extends Errors.TransactionError {
    constructor() {
        super(`Stake already canceled.`);
    }
}

export class LessThanMinimumStakeError extends Errors.TransactionError {
    constructor() {
        super(`Stake should be greater than allowed minimum.`);
    }
}
