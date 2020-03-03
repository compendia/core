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
        super(`Stake at this timestamp already exists.`);
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

export class StakeAlreadyRedeemedError extends Errors.TransactionError {
    constructor() {
        super(`Stake has already been redeemed.`);
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

export class LessThanMinimumStakeError extends Errors.TransactionError {
    constructor() {
        super(`Stake should be greater than allowed minimum.`);
    }
}
